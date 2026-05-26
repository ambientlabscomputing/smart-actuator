//! Per-actuator gRPC client pool.
//!
//! Maintains one `ActuatorServiceClient` per actuator endpoint.  All clients
//! are created eagerly at startup so connection errors surface before motion
//! commands arrive.

use crate::types::ActuatorEndpoint;
use actuator_proto::actuator::actuator_service_client::ActuatorServiceClient;
use anyhow::{Context, Result};
use std::collections::HashMap;
use tonic::transport::Channel;
use tracing::{info, warn};

pub struct ActuatorClientPool {
    clients: HashMap<String, ActuatorServiceClient<Channel>>,
    /// Parallel list kept for ordered iteration.
    endpoints: Vec<ActuatorEndpoint>,
}

impl ActuatorClientPool {
    /// Connect to every endpoint.  Failures are logged but do not abort
    /// startup — the pool will simply have fewer clients and the aggregator
    /// will report those actuators as Unknown.
    pub async fn connect(endpoints: Vec<ActuatorEndpoint>) -> Self {
        let mut clients = HashMap::new();
        let mut live_endpoints = Vec::new();

        for ep in &endpoints {
            match ActuatorServiceClient::connect(ep.address.clone()).await {
                Ok(client) => {
                    info!(id = %ep.id, address = %ep.address, "Connected to actuator");
                    clients.insert(ep.id.clone(), client);
                    live_endpoints.push(ep.clone());
                }
                Err(e) => {
                    warn!(id = %ep.id, address = %ep.address, error = %e,
                          "Failed to connect to actuator — will retry on next command");
                }
            }
        }

        Self {
            clients,
            endpoints: live_endpoints,
        }
    }

    /// Returns a mutable reference to the client for the given actuator id.
    pub fn get_mut(&mut self, id: &str) -> Option<&mut ActuatorServiceClient<Channel>> {
        self.clients.get_mut(id)
    }

    /// Iterate over all connected (id, client) pairs mutably.
    pub fn iter_mut(
        &mut self,
    ) -> impl Iterator<Item = (&String, &mut ActuatorServiceClient<Channel>)> {
        self.clients.iter_mut()
    }

    /// The subset of endpoints for which a client exists.
    pub fn live_endpoints(&self) -> &[ActuatorEndpoint] {
        &self.endpoints
    }

    pub fn len(&self) -> usize {
        self.clients.len()
    }

    pub fn is_empty(&self) -> bool {
        self.clients.is_empty()
    }

    /// Attempt to reconnect a single actuator that was previously unreachable.
    pub async fn reconnect(&mut self, ep: &ActuatorEndpoint) -> Result<()> {
        let client = ActuatorServiceClient::connect(ep.address.clone())
            .await
            .with_context(|| format!("reconnect to actuator {}", ep.id))?;
        info!(id = %ep.id, address = %ep.address, "Reconnected to actuator");
        self.clients.insert(ep.id.clone(), client);
        if !self.endpoints.iter().any(|e| e.id == ep.id) {
            self.endpoints.push(ep.clone());
        }
        Ok(())
    }
}
