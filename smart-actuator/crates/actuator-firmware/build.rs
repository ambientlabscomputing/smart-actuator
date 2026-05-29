// build.rs — required by esp-idf-sys / esp-idf-svc.
//
// Reads the ESP-IDF environment variables set by `source ~/export-esp.sh`
// and outputs them as Cargo env vars so esp-idf-sys can locate the
// toolchain, IDF path, and sdkconfig.
//
// Also declares the firmware's runtime config env vars so that editing .env
// (via the Makefile's `-include .env` + `export`) triggers a rebuild and the
// new values are baked in via `option_env!` in src/config.rs.
fn main() {
    embuild::espidf::sysenv::output();

    // Track firmware config env vars. If any of these change between builds,
    // cargo will rebuild so `option_env!` picks up the new values.
    for var in [
        "ACTUATOR_ID",
        "ACTUATOR_GRPC_PORT",
        "WIFI_SSID",
        "WIFI_PASSWORD",
    ] {
        println!("cargo:rerun-if-env-changed={var}");
    }

    // Declare the cfg flags that embuild/esp-idf-sys emit for optional ESP-IDF
    // components so rustc's check-cfg lint doesn't flag them as unexpected.
    println!("cargo:rustc-check-cfg=cfg(esp_idf_comp_mdns_enabled)");
    println!("cargo:rustc-check-cfg=cfg(esp_idf_comp_espressif__mdns_enabled)");
}
