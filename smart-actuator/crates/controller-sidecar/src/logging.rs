//! Tracing initialisation.

use crate::config::LogSettings;
use std::path::Path;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{fmt, EnvFilter};

/// Initialise tracing.  The returned [`WorkerGuard`] **must** be kept alive
/// for the lifetime of the process — dropping it flushes and closes the sink.
pub fn setup(settings: &LogSettings) -> WorkerGuard {
    let filter =
        EnvFilter::try_new(&settings.level).unwrap_or_else(|_| EnvFilter::new("info"));

    if settings.log_to_stderr {
        let (non_blocking, guard) = tracing_appender::non_blocking(std::io::stderr());
        fmt()
            .with_env_filter(filter)
            .with_target(true)
            .with_writer(non_blocking)
            .init();
        guard
    } else {
        let path = Path::new(&settings.file);
        let dir = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("sidecar.log");
        let appender = tracing_appender::rolling::never(dir, filename);
        let (non_blocking, guard) = tracing_appender::non_blocking(appender);
        fmt()
            .json()
            .with_env_filter(filter)
            .with_target(true)
            .with_writer(non_blocking)
            .init();
        guard
    }
}
