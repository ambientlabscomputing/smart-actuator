//! Actuator discovery.
//!
//! v1: static configuration only.
//! Future: mDNS broadcast, USB enumeration, gRPC reflection on a known multicast group.

use crate::config::DiscoveryConfig;
use crate::types::ActuatorEndpoint;
use tracing::info;

pub struct Discovery {
    config: DiscoveryConfig,
}

impl Discovery {
    pub fn new(config: DiscoveryConfig) -> Self {
        Self { config }
    }

    /// Return the list of actuator endpoints to manage.
    ///
    /// Currently reads from the static config list.
    /// TODO: add mDNS and USB enumeration modes.
    pub fn discover(&self) -> Vec<ActuatorEndpoint> {
        let endpoints: Vec<ActuatorEndpoint> = self
            .config
            .static_actuators
            .iter()
            .map(|a| {
                info!(
                    id = %a.id,
                    address = %a.address,
                    joint = %a.joint_name,
                    simulated = a.is_simulated,
                    "Discovered actuator (static config)"
                );
                ActuatorEndpoint {
                    id: a.id.clone(),
                    address: a.address.clone(),
                    joint_name: a.joint_name.clone(),
                    is_simulated: a.is_simulated,
                }
            })
            .collect();
        info!("Discovery complete: {} actuator(s) found", endpoints.len());
        endpoints
    }
}
