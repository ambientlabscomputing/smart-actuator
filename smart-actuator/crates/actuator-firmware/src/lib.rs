// lib.rs — re-exports the HAL module for use by example binaries.
//
// The main firmware binary (src/main.rs) uses `mod hal;` directly.
// Example binaries (examples/test_*.rs) use `use actuator_firmware::hal::*;`
// via this library target so they share the same driver implementations.

pub mod hal;

