# Jog Actuator CAD Module

The jog actuator's hardware, designed as parametrized code rather than
drawn by hand: a NEMA-mount cycloidal reduction gearbox, its outer
shell, and an electronics board mount, composed into one actuator
assembly.

This module has no CAD framework of its own — it's a thin consumer of
[machinewright](https://github.com/ambientlabscomputing/machinewright),
which supplies the `CADObject`/`CADAssembly` base classes, the generic
reusable component library (bolts, pins, bearings), and the CLI that
discovers, lists, and exports everything below. Only the actuator's own
domain-specific parts and assemblies live in this module:

- `objects/cycloidal_gearbox/` — `CycloidalDisc`, `RingHousing`,
  `InputShaft`, `MotorAdapterPlate`, `OutputFlange`
- `objects/shell/` — `ShellBody`, `ShellLid`
- `objects/electronics/` — `BoardMount`
- `assemblies/` — `CycloidalGearboxAssembly`, `ShellAssembly`,
  `ElectronicsAssembly`, `ActuatorAssembly`
- `lib/nema.py`, `lib/cycloidal.py` — NEMA faceplate specs and the
  cycloidal disc profile math, both specific enough to this hardware
  that they don't belong in machinewright's generic library

Every object/assembly is registered via `@register_object`/
`@register_assembly` (from `machinewright`) at the point it's defined;
`[tool.machinewright] modules` in `pyproject.toml` tells the CLI which
modules to import so those decorators actually run.

## Setup

```bash
uv sync --group dev
```

## Usage

Run `machinewright` from this directory (`cad/`) so it picks up
`[tool.machinewright] modules` — everything below assumes that.

```bash
uv run machinewright objects list
uv run machinewright assemblies list
```

Object/assembly identifiers are fully-qualified dotted class paths, so
`assemblies list`/`objects list` show you exactly what to pass to
`export`:

```bash
uv run machinewright export step "assemblies.cad.assemblies.actuator.ActuatorAssembly" \
  --params '{"nema_size":"17","num_ring_pins":10,"ring_pin_diameter":4,"eccentricity":1.0,"disc_thickness":6,"num_output_rollers":6,"roller_pin_diameter":5,"output_interface_diameter":14,"ring_pin_thread_size":"M3","roller_pin_thread_size":"M3","num_shell_bolts":8,"num_interface_bolts":4,"interface_thread_size":"M3","num_adapter_bolts":4,"adapter_thread_size":"M3","shell_wall_thickness":2.5,"shell_lid_thickness":4,"shell_thread_size":"M3","pod_depth":15,"pod_center_z":14.2,"board_width":25.4,"board_length":25.4,"board_hole_inset":2.5,"board_standoff_height":5,"board_plate_thickness":3,"board_thread_size":"M3","num_board_bolts":4}' \
  --location build/step/actuator.step
```

Add `--exploded` (and `--explode-nested` to also explode sub-assemblies'
own internals, e.g. the gearbox/shell/electronics inside
`ActuatorAssembly`) for an exploded view. `export` supports `svg`,
`step`, `stl`, or `other <format>` for anything else cadquery can write.

For the common cases, skip the raw CLI invocations and use the Makefile
targets instead — see below.

## Generating STEP files

```bash
make step-gearbox            # cycloidal gearbox alone -> build/step/gearbox.step
make step-actuator           # full actuator assembly -> build/step/actuator.step
make step-actuator-exploded  # full actuator, exploded -> build/step/actuator-exploded.step
make step-all                # all three
make clean                   # remove build/step
```

Override the default params with `GEARBOX_PARAMS=`/`ACTUATOR_PARAMS=`,
e.g. to swap motor size:

```bash
make step-gearbox GEARBOX_PARAMS='{"nema_size":"23", ...}'
```
