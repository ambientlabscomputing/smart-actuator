"""
Project-specific material/color overrides for this actuator's viewer/STEP
output. machinewright's own MATERIALS catalog is a generic starter --
these give the printed housing parts a bright, easy-to-spot color and the
metal hardware (bearings, shoulder bolts) a dark grey/black, distinct from
each other in any assembly viewer.
"""

from machinewright.lib.materials import Material, Process

PRINTED = Material(name="PLA", process=Process.PRINTED, color=(1.0, 0.45, 0.0), density=1.24)

METAL = Material(
    name="Off-the-shelf hardware", process=Process.PURCHASED, color=(0.12, 0.12, 0.13)
)

MAGNET = Material(
    name="Diametric ring magnet", process=Process.PURCHASED, color=(0.75, 0.1, 0.1)
)
