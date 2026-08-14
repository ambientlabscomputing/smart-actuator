from machinewright import register_assembly

from cad.assemblies.actuator import ActuatorAssembly
from cad.assemblies.alternate_cycloidal_gearbox import AlternateCycloidalGearboxAssembly


@register_assembly
class AlternateActuatorAssembly(ActuatorAssembly):
    """
    Fully 3D-printable test-fit build of `ActuatorAssembly` -- same
    design, same mating dimensions, but the gearbox's eccentric bearing
    prints instead of using off-the-shelf hardware and its ring/roller
    pins are molded into the housing/flange instead of being separate
    shoulder bolts, so the whole thing can be printed and physically
    test-fit before ordering anything. Everything else is already
    `PRINTED`, so only the gearbox needs to change.

    `ActuatorAssembly` itself is never modified -- this only reuses its
    inherited `assemble()` (unchanged) and overrides `_gearbox()` to
    build an `AlternateCycloidalGearboxAssembly` instead.
    """

    def _gearbox(self) -> AlternateCycloidalGearboxAssembly:
        return AlternateCycloidalGearboxAssembly(
            nema_size=self.nema_size,
            num_ring_pins=self.num_ring_pins,
            ring_pin_diameter=self.ring_pin_diameter,
            eccentricity=self.eccentricity,
            disc_thickness=self.disc_thickness,
            num_output_rollers=self.num_output_rollers,
            roller_pin_diameter=self.roller_pin_diameter,
            output_interface_diameter=self.output_interface_diameter,
            ring_pin_thread_size=self.ring_pin_thread_size,
            roller_pin_thread_size=self.roller_pin_thread_size,
            num_shell_bolts=self.num_shell_bolts,
            num_interface_bolts=self.num_interface_bolts,
            interface_thread_size=self.interface_thread_size,
            num_adapter_bolts=self.num_adapter_bolts,
            adapter_thread_size=self.adapter_thread_size,
            bearing_inner_diameter=self.bearing_inner_diameter,
            bearing_outer_diameter=self.bearing_outer_diameter,
        )
