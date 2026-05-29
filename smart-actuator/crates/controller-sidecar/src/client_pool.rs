//! Per-actuator wire-protocol client pool.

use crate::types::ActuatorEndpoint;
use actuator_proto::wire::async_wire::WireClient;
use anyhow::{Context, Result};
use std::collections::HashMap;
use tracing::{info, warn};

pub struct ActuatorClientPool {
    clients: HashMap<String, WireClient>,
    endpoints: Vec<ActuatorEndpoint>,
}

impl ActuatorClientPool {
    pub async fn connect(endpoints: Vec<ActuatorEndpoint>) -> Self {
        let mut clients = HashMap::new();

        for ep in &endpoints {
            match WireClient::connect(&ep.address).await {
                Ok(client) => {
                    info!(id = %ep.id, address = %ep.address, "Connected to actuator");
                    clients.insert(ep.id.clone(), client);
                }
                Err(e) => {
                    warn!(id = %ep.id, address = %ep.address, error = %e,
                          "Failed to connect to actuator at startup -- added as lazy (will retry on first use)");
                    clients.insert(ep.id.clone(), WireClient::lazy(&ep.address));
                }
            }
        }

        Self { clients, endpoints: endpoints }
    }

    /// Returns a clone of the client for the given actuator id.
    /// WireClient is Clone (cheap -- shares an Arc<Mutex<TcpStream>>).
    pub fn get(&self, id: &str) -> Option<WireClient> {
        self.clients.get(id).cloned()
    }

    pub fn iter(&self) -> impl Iterator<Item = (&String, WireClient)> {
        self.clients.iter().map(|(id, c)| (id, c.clone()))
    }

    pub fn live_endpoints(&self) -> &[ActuatorEndpoint] {
        &self.endpoints
    }

    pub fn len(&self) -> usize {
        self.clients.len()
    }

    pub fn is_empty(&self) -> bool {
        self.clients.is_empty()
    }

    pub fn joint_name_for(&self, id: &str) -> Option<&str> {
        self.endpoints.iter().find(|e| e.id == id).map(|e| e.joint_name.as_str())
    }

    pub async fn reconnect(&mut self, ep: &ActuatorEndpoint) -> Result<()> {
        let client = WireClient::connect(&ep.address)
            .await
            .with_context(|| format!("reconnect to actuator {}", ep.id))?;
        info!(id = %ep.id, address = %ep.address, "Reconnected to actuator");
        self.clients.insert(ep.id.clone(), client);
        if !self.endpoints.iter().any(|e| e.id == ep.id) {
            self.endpoints.push(ep.clone());
        }
        Ok(())
    }

    pub async fn add_peer(&mut self, ep: ActuatorEndpoint) -> Result<()> {
        // Use a lazy client — no TCP connect at registration time.
        // The first RPC call will connect (and will keep retrying on failure),
        // so registration succeeds even if the actuator is still booting.
        let client = WireClient::lazy(&ep.address);
        info!(id = %ep.id, address = %ep.address, "Dynamic peer registered (lazy connect)");
        self.clients.insert(ep.id.clone(), client);
        if !self.endpoints.iter().any(|e| e.id == ep.id) {
            self.endpoints.push(ep);
        }
        Ok(())
    }

    pub fn remove_peer(&mut self, id: &str) -> bool {
        let removed = self.clients.remove(id).is_some();
        self.endpoints.retain(|e| e.id != id);
        if removed {
            info!(id = %id, "Dynamic peer deregistered");
        } else {
            warn!(id = %id, "DeregisterPeer: peer not found in pool");
        }
        removed
    }
}
