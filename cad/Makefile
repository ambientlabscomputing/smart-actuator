# cad — STEP export commands for the jog actuator hardware, via machinewright
#
# machinewright discovers this module's objects/assemblies from
# [tool.machinewright] in pyproject.toml; these targets just call its CLI
# with sane default params. Override any param by passing PARAMS= on the
# command line, e.g.:
#   make step-actuator PARAMS='{"nema_size":"23",...}'

OUT_DIR ?= build/step

GEARBOX_CLASS      := assemblies.cad.assemblies.cycloidal_gearbox.CycloidalGearboxAssembly
ACTUATOR_CLASS     := assemblies.cad.assemblies.actuator.ActuatorAssembly
ALT_ACTUATOR_CLASS := assemblies.cad.assemblies.alternate_actuator.AlternateActuatorAssembly

GEARBOX_PARAMS ?= {"nema_size":"17","num_ring_pins":10,"ring_pin_diameter":4,"eccentricity":1.0,"disc_thickness":6,"num_output_rollers":6,"roller_pin_diameter":5,"output_interface_diameter":14,"ring_pin_thread_size":"M3","roller_pin_thread_size":"M3","num_shell_bolts":8,"num_interface_bolts":4,"interface_thread_size":"M3","num_adapter_bolts":4,"adapter_thread_size":"M3","bearing_inner_diameter":10,"bearing_outer_diameter":22}

ACTUATOR_PARAMS ?= {"nema_size":"17","num_ring_pins":10,"ring_pin_diameter":4,"eccentricity":1.0,"disc_thickness":6,"num_output_rollers":6,"roller_pin_diameter":5,"output_interface_diameter":14,"ring_pin_thread_size":"M3","roller_pin_thread_size":"M3","num_shell_bolts":8,"num_interface_bolts":4,"interface_thread_size":"M3","num_adapter_bolts":4,"adapter_thread_size":"M3","bearing_inner_diameter":10,"bearing_outer_diameter":22,"shell_wall_thickness":2.5,"shell_lid_thickness":4,"shell_thread_size":"M3","pod_depth":15,"pod_center_z":14.2,"board_width":25.4,"board_length":25.4,"board_hole_inset":2.5,"board_standoff_height":5,"board_plate_thickness":3,"board_thread_size":"M3","num_board_bolts":4}

## help: Print this help
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //' | awk -F': ' '{printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'

## step-gearbox: Export the cycloidal gearbox alone to STEP (build/step/gearbox.step)
step-gearbox:
	@mkdir -p $(OUT_DIR)
	uv run machinewright export step "$(GEARBOX_CLASS)" \
		--params '$(GEARBOX_PARAMS)' \
		--location $(OUT_DIR)/gearbox.step

## step-actuator: Export the full actuator assembly to STEP (build/step/actuator.step)
step-actuator:
	@mkdir -p $(OUT_DIR)
	uv run machinewright export step "$(ACTUATOR_CLASS)" \
		--params '$(ACTUATOR_PARAMS)' \
		--location $(OUT_DIR)/actuator.step

## step-actuator-exploded: Export the full actuator assembly, fully exploded (nested), to STEP (build/step/actuator-exploded.step)
step-actuator-exploded:
	@mkdir -p $(OUT_DIR)
	uv run machinewright export step "$(ACTUATOR_CLASS)" \
		--params '$(ACTUATOR_PARAMS)' \
		--exploded --explode-nested --explode-spacing 40 \
		--location $(OUT_DIR)/actuator-exploded.step

## step-actuator-alt: Export the fully 3D-printable test-fit actuator assembly to STEP (build/step/actuator-alt.step)
step-actuator-alt:
	@mkdir -p $(OUT_DIR)
	uv run machinewright export step "$(ALT_ACTUATOR_CLASS)" \
		--params '$(ACTUATOR_PARAMS)' \
		--location $(OUT_DIR)/actuator-alt.step

## print-layout: Export every printed part of the actuator, packed for slicing, to STL (build/step/print-layout.stl)
print-layout:
	@mkdir -p $(OUT_DIR)
	uv run machinewright export print-layout "$(ACTUATOR_CLASS)" \
		--params '$(ACTUATOR_PARAMS)' \
		--process PRINTED \
		--location $(OUT_DIR)/print-layout.stl

## print-layout-alt: Export every part of the fully 3D-printable test-fit actuator, packed for slicing, to STL (build/step/print-layout-alt.stl)
print-layout-alt:
	@mkdir -p $(OUT_DIR)
	uv run machinewright export print-layout "$(ALT_ACTUATOR_CLASS)" \
		--params '$(ACTUATOR_PARAMS)' \
		--process PRINTED \
		--location $(OUT_DIR)/print-layout-alt.stl

## bom: Export a bill of materials for the actuator assembly to CSV (build/step/bom.csv)
bom:
	@mkdir -p $(OUT_DIR)
	uv run machinewright export bom "$(ACTUATOR_CLASS)" \
		--params '$(ACTUATOR_PARAMS)' \
		--location $(OUT_DIR)/bom.csv

## step-all: Export gearbox, actuator, exploded actuator, print layout, and BOM in one go
step-all: step-gearbox step-actuator step-actuator-exploded print-layout bom

## step-all-alt: Export gearbox, actuator, exploded actuator, print layout, and BOM in one go, using the fully 3D-printable test-fit actuator
step-all-alt: step-gearbox step-actuator-alt print-layout-alt bom

## clean: Remove generated STEP output
clean:
	rm -rf $(OUT_DIR)

.PHONY: help step-gearbox step-actuator step-actuator-exploded step-actuator-alt print-layout print-layout-alt bom step-all clean
