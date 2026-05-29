pub mod actuator {
    // With the `tonic` feature: full codegen (prost types + tonic stubs).
    // Without it (firmware): prost-only types, no tonic service traits.
    #[cfg(feature = "tonic")]
    tonic::include_proto!("actuator");

    #[cfg(not(feature = "tonic"))]
    include!(concat!(env!("OUT_DIR"), "/actuator.rs"));
}

pub mod wire;
