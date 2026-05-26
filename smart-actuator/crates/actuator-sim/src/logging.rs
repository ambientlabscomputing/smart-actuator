use tracing_subscriber::{fmt, EnvFilter};

use crate::config::LogSettings;

pub fn setup(settings: &LogSettings) {
    let filter = EnvFilter::try_new(&settings.level)
        .unwrap_or_else(|_| EnvFilter::new("info"));

    let builder = fmt()
        .with_env_filter(filter)
        .with_target(true)
        .with_thread_ids(false);

    if settings.log_to_stderr {
        builder.with_writer(std::io::stderr).init();
    } else {
        builder.init();
    }
}
