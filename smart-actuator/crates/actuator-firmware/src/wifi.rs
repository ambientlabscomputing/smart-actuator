// src/wifi.rs — WiFi station (STA) connection and mDNS announcement.
//
// Connects to the configured SSID, then — if the mDNS component is compiled
// into this ESP-IDF build — announces the gRPC service via mDNS so the
// Sidecar can discover it without static IP configuration.
//
// mDNS availability: `esp_idf_svc::mdns` is gated on the
// `esp_idf_comp_mdns_enabled` cfg flag, which embuild sets when the ESP-IDF
// mdns component is present in the build. If it is absent (cfg not set),
// the firmware still connects and logs its IP address — the Sidecar can use
// that IP directly instead of browsing mDNS.
//
// The returned handles must be kept alive for the duration of the program
// — dropping them disconnects WiFi / stops mDNS.

use anyhow::{bail, Context, Result};
use esp_idf_svc::{
    eventloop::EspSystemEventLoop,
    hal::modem::Modem,
    nvs::EspDefaultNvsPartition,
    wifi::{AuthMethod, BlockingWifi, ClientConfiguration, Configuration, EspWifi},
};
use log::info;

use crate::config::FirmwareConfig;

/// Long-lived WiFi (+ optionally mDNS) handles. Drop = disconnect.
pub struct NetworkHandles {
    _wifi: BlockingWifi<EspWifi<'static>>,
    // mDNS handle kept alive so the service record remains active.
    // Only present when the ESP-IDF mdns component is compiled in.
    #[cfg(esp_idf_comp_mdns_enabled)]
    _mdns: esp_idf_svc::mdns::EspMdns,
}

/// Connect to WiFi (STA mode) and optionally register an mDNS service record.
pub fn connect(modem: Modem, cfg: &FirmwareConfig) -> Result<NetworkHandles> {
    if cfg.wifi_ssid.is_empty() {
        bail!(
            "WIFI_SSID is not set. Copy .env.example to .env and set your network credentials, \
             then rebuild with `make firmware-build`."
        );
    }

    let sys_loop = EspSystemEventLoop::take().context("EspSystemEventLoop::take")?;
    let nvs = EspDefaultNvsPartition::take().context("EspDefaultNvsPartition::take")?;

    let mut wifi = BlockingWifi::wrap(
        EspWifi::new(modem, sys_loop.clone(), Some(nvs)).context("EspWifi::new")?,
        sys_loop,
    )
    .context("BlockingWifi::wrap")?;

    wifi.set_configuration(&Configuration::Client(ClientConfiguration {
        ssid: cfg.wifi_ssid.as_str().try_into().map_err(|_| {
            anyhow::anyhow!("WIFI_SSID is too long (max 32 chars)")
        })?,
        password: cfg.wifi_password.as_str().try_into().map_err(|_| {
            anyhow::anyhow!("WIFI_PASSWORD is too long (max 64 chars)")
        })?,
        auth_method: if cfg.wifi_password.is_empty() {
            AuthMethod::None
        } else {
            AuthMethod::WPA2Personal
        },
        ..Default::default()
    }))
    .context("set_configuration")?;

    wifi.start().context("wifi.start")?;
    wifi.connect().context("wifi.connect")?;
    wifi.wait_netif_up().context("wifi.wait_netif_up")?;

    let ip = wifi.wifi().sta_netif().get_ip_info().context("get_ip_info")?;
    info!("WiFi connected — IP: {} (gRPC will listen on :{})", ip.ip, cfg.grpc_port);

    // ── mDNS (conditional on ESP-IDF mdns component) ───────────────────────────
    #[cfg(esp_idf_comp_mdns_enabled)]
    let _mdns = {
        let mut mdns = esp_idf_svc::mdns::EspMdns::take().context("EspMdns::take")?;
        mdns.set_hostname(&cfg.actuator_id).context("mdns set_hostname")?;
        mdns.set_instance_name(&cfg.actuator_id).context("mdns set_instance_name")?;
        mdns.add_service(
            Some(&cfg.actuator_id),
            "_actuator",
            "_tcp",
            cfg.grpc_port,
            &[("id", &cfg.actuator_id)],
        )
        .context("mdns add_service")?;
        info!("mDNS: advertising {}._actuator._tcp on port {}", cfg.actuator_id, cfg.grpc_port);
        mdns
    };

    #[cfg(not(esp_idf_comp_mdns_enabled))]
    info!(
        "mDNS component not compiled in — Sidecar can reach this actuator at {}:{}",
        ip.ip, cfg.grpc_port
    );

    Ok(NetworkHandles {
        _wifi: wifi,
        #[cfg(esp_idf_comp_mdns_enabled)]
        _mdns,
    })
}


