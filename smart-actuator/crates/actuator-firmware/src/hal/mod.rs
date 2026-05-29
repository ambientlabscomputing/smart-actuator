// src/hal/mod.rs — Hardware Abstraction Layer.
//
// Exports a single `HalHardware` type that implements `actuator_core::Hardware`.
// Phase 1: all reads return stubs (zeros / constants).
// Phase 2: each sub-module gains real driver calls.

pub mod as5600;
pub mod ina219;
pub mod ntc;
pub mod tmc2209;

mod hardware;
pub use hardware::HalHardware;
