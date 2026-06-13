# actuator-firmware

ESP32 firmware for the Smart Actuator testbench. Implements the `ActuatorService`
gRPC surface (identical to `actuator-sim`) over WiFi so the Sidecar treats this
board indistinguishably from a running simulator.

This is the physical half of the J6 architecture validation journey — see
[RFD-8](../../../RFDs/RFD-8.md) and [RFD-10](../../../RFDs/RFD-10.md).

## Getting started

```
make firmware-setup
source ~/export-esp.sh
cp .env.example .env   # then edit: set WIFI_SSID and WIFI_PASSWORD
make firmware-flash
```

That's it. The board boots, joins WiFi, announces itself via mDNS
(`_actuator._tcp`), and serves gRPC on port 50051. The Sidecar picks it up
automatically.

## Prerequisites

`make firmware-setup` installs everything, but it needs these system packages
first (macOS):

```
brew install cmake ninja protobuf
```

And Rust via [rustup.rs](https://rustup.rs).

## Common commands

| Command | Purpose |
|---|---|
| `make firmware-setup` | One-time onboarding (toolchain + host tools) |
| `make firmware-flash` | Build, flash, and open serial monitor |
| `make firmware-monitor` | Attach serial monitor (board already flashed) |
| `make firmware-check` | Compile-check only (CI, no board needed) |
| `make firmware-wokwi` | Run in Wokwi simulator (no board needed) |
| `make firmware-erase` | Erase all flash (recovery) |
| `make firmware-doctor` | Verify prerequisites |

## HAL smoke tests (Phase 2, requires board + wiring)

Run after the board is wired up but before enabling the full firmware stack.
Each test flashes a minimal binary that exercises one peripheral:

```
make firmware-test-encoder   # AS5600 — rotate shaft, expect monotonic sweep
make firmware-test-stepper   # TMC2209 — motor spins at 0.5 rev/s
make firmware-test-current   # INA219 — stall motor to see current spike
make firmware-test-temp      # NTC — touch driver IC to see temperature rise
make firmware-test-hal       # All four in sequence with prompts
```

## Configuration

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `WIFI_SSID` | 2.4 GHz network name |
| `WIFI_PASSWORD` | Network password |
| `ACTUATOR_ID` | Unique ID for this board (e.g. `bench-j0`) |
| `ACTUATOR_GRPC_PORT` | gRPC listen port (default `50051`) |
| `PORT` | Serial port override (auto-detected if blank) |

## Repository layout

```
actuator-firmware/
├── Makefile              — all firmware-* targets
├── .env.example          — environment variable template
├── .cargo/config.toml    — Xtensa target + ldproxy linker
├── sdkconfig.defaults    — ESP-IDF compile-time configuration
├── build.rs              — embuild ESP-IDF env forwarding
├── wokwi.toml            — Wokwi simulator config
└── src/
    ├── main.rs           — entry point: WiFi → mDNS → gRPC server
    ├── config.rs         — FirmwareConfig from env vars
    ├── wifi.rs           — WiFi STA connection + mDNS announcement
    ├── grpc.rs           — ActuatorService server (mirrors actuator-sim)
    ├── lib.rs            — re-exports hal for examples
    └── hal/
        ├── hardware.rs   — HalHardware: actuator_core::Hardware impl
        ├── as5600.rs     — AS5600 magnetic encoder driver (Phase 2)
        ├── tmc2209.rs    — TMC2209 stepper driver (Phase 2)
        ├── ina219.rs     — INA219 current sensor driver (Phase 2)
        └── ntc.rs        — NTC thermistor driver (Phase 2)
examples/
    ├── test_encoder.rs   — AS5600 smoke test
    ├── test_stepper.rs   — TMC2209 open-loop smoke test
    ├── test_current.rs   — INA219 smoke test
    └── test_temp.rs      — NTC smoke test
```

## Architecture notes

The firmware implements the same `actuator.proto` gRPC surface as `actuator-sim`.
The control logic (`AppService` from `actuator-core`) is shared between firmware
and simulator — the only difference is the `Hardware` implementation. In firmware
it is `HalHardware`; in the simulator it is `SimPlant`.

Phase 1: `HalHardware` stubs return constants. The gRPC surface is fully live.
Phase 2: Each `hal/` sub-module gets real driver calls.
Phase 3: A 1 kHz PD loop is pinned to core 0; the gRPC server stays on core 1.
