import aiosqlite

_SCHEMA = """
CREATE TABLE IF NOT EXISTS machines (
    id              TEXT PRIMARY KEY,
    description_json TEXT NOT NULL,
    expanded_urdf   TEXT NOT NULL DEFAULT '',
    created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS sim_registry (
    machine_id  TEXT NOT NULL,
    slot        INTEGER NOT NULL,
    address     TEXT NOT NULL,
    pid         INTEGER NOT NULL,
    actuator_id TEXT NOT NULL,
    joint_name  TEXT NOT NULL DEFAULT '',
    spawned_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (machine_id, slot)
);

CREATE TABLE IF NOT EXISTS hardware_registry (
    machine_id  TEXT NOT NULL,
    slot        INTEGER NOT NULL,
    address     TEXT NOT NULL,
    actuator_id TEXT NOT NULL,
    joint_name  TEXT NOT NULL DEFAULT '',
    bound_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (machine_id, slot)
);

CREATE TABLE IF NOT EXISTS calibration_sessions (
    job_id              TEXT PRIMARY KEY,
    machine_id          TEXT NOT NULL,
    joint_index         INTEGER NOT NULL,
    status              TEXT NOT NULL,
    step                INTEGER NOT NULL DEFAULT 0,
    prompt              TEXT NOT NULL DEFAULT '',
    last_measurement_json TEXT NOT NULL DEFAULT '{}',
    result_json         TEXT NOT NULL DEFAULT '{}',
    error               TEXT NOT NULL DEFAULT '',
    created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS programs (
    id          TEXT PRIMARY KEY,
    data_json   TEXT NOT NULL,
    updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS program_runs (
    run_id              TEXT PRIMARY KEY,
    program_id          TEXT NOT NULL,
    machine_id          TEXT NOT NULL,
    status              TEXT NOT NULL,
    current_step_index  INTEGER NOT NULL DEFAULT 0,
    total_steps         INTEGER NOT NULL DEFAULT 0,
    current_node_id     TEXT NOT NULL DEFAULT '',
    error               TEXT NOT NULL DEFAULT '',
    created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS mode_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id  TEXT NOT NULL,
    event_json  TEXT NOT NULL,
    recorded_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
"""


async def migrate(db: aiosqlite.Connection) -> None:
    """Execute the initial schema migration."""
    await db.executescript(_SCHEMA)
    await db.commit()
