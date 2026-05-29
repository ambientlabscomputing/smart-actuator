fn main() -> Result<(), Box<dyn std::error::Error>> {
    let use_tonic = std::env::var("CARGO_FEATURE_TONIC").is_ok();
    if use_tonic {
        // Full codegen: prost message types + tonic service/client stubs.
        tonic_build::compile_protos("../../proto/actuator.proto")?;
    } else {
        // Prost-only codegen: message types only, no tonic service traits.
        // Used by actuator-firmware which can't link tonic's h2/hyper stack.
        prost_build::compile_protos(&["../../proto/actuator.proto"], &["../../proto"])?;
    }
    Ok(())
}
