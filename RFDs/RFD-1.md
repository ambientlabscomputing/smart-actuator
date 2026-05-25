# RFD-1: The Smart Actuator
Author: Jose Catarino

## The vision

A maker finishes assembling their machine using Ambient Labs Smart Actuators.
They open their control computer and deploy a controller container. This gives
them a local UI to the controller system. In a small amount of time, the user
is able to onboard their new machine and start programming it from this UI.

```
Buy Smart Actuators
        ↓
plug them into a host computer
        ↓
deploy the controller container
        ↓
open a browser UI
        ↓
discover actuators
        ↓
describe the machine (URDF / joint roles)
        ↓
calibrate and test safely
        ↓
program behavior with blocks / scripts / modes
```

## A key distinction

The system has two physical layers and two conceptual roles within the host.

**Smart Actuator** (on the actuator itself)
- motor control, encoder feedback, current and thermal sense
- soft limits, current/thermal cutoffs, control-mode selection
- local safety enforcement: refuses commands it cannot execute safely
- local calibration, heal- local calibration, heal- local calibration, heal- local calibration, heal-ec- local calibration, heal- local calibration, heal- local calibration, heal- RD- local calibration, heal- local calibration, heal- local calibration, healrajectory generation and whole-machine coordination
- MuJoCo physics simulation
- ROS gateway
- public REST + WebSocket API for the UI and CLI

**Controller — Sidecar** (host, Rust)
- gRPC client pool to all connected actuators
- actuator discovery and addressing
- E-stop broadcast
- safety watchdog: holds or halts the machine if the Brain stops responding
- joint-state stream aggregation

The Brain and Sidecar are internal components of one logical Controller
process — not separate services. The distinction matters for latency and
failure domains: the Sidecar is on the critical path for safety and
must survive a Brain crash.

## What "joint cluster" meant, and where it went

Earlier drafts described a three-layer model with a "joint cluster / limb
controller" in the middle. That layer does not become its own service.
Its responsibilities are split:

- local coordination, safety envelopes → each Smart Actuator (autonomous)
- transport, discovery, watchdog, timing → Controller Sidecar
- interpolation, whole-machine coordination → Controller Brain

The Smart Actuators *are* the cluster. The Controller is the gateway.
