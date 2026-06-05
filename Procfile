# The Brain spawns actuator-sim processes itself when POST /machine/{id}/bindings/{slot} is called.
sidecar: bash -c 'cd smart-actuator && SIDECAR_CONFIG=crates/controller-sidecar/configs/default.yaml exec ./target/debug/controller-sidecar run'
brain:   bash -c 'cd brain && exec python -m brain.main run'
ui:      bash -c 'cd ui && exec npm run dev'
