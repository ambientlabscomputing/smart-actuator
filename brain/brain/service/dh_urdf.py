"""
Generic DH-chain → URDF generator and parameter ↔ DH-chain converters.

The generator reads a template's DHChainSchema together with a machine's
DHChainValues and emits a URDF XML string for a serial revolute chain.
It uses the same +Z-link convention as the hand-written two_dof_planar_arm
Jinja template so the ArmCanvas preview remains accurate.

No per-template Python is needed — a new template declares its dh: + easy:
blocks in template.yaml and this module handles the rest.
"""

import math
import xml.etree.ElementTree as ET
from xml.dom import minidom

from brain.models.machine import DHChainSchema, DHChainValues, DHJointValues, EasyAlias


# ── Public: URDF generation ───────────────────────────────────────────────────


def dh_chain_to_urdf(
    schema: DHChainSchema,
    values: DHChainValues,
    robot_name: str = "robot",
) -> str:
    """
    Build a URDF string from a DHChainSchema and DHChainValues.

    Convention (same as existing two_dof_planar_arm):
    - Links are cylinders extending along local +Z.
    - Joints rotate about Z (axis xyz="0 0 1").
    - The joint origin translates by the previous link length along Z (= a[i-1]).
    - d, alpha, theta_offset are applied as additional transforms / axis rotation.
    - Limits stored in degrees; converted to radians for URDF.

    Returns a pretty-printed URDF XML string.
    """
    root = ET.Element("robot", name=robot_name)

    radius = values.link_radius

    _add_base_link(root)

    prev_length: float = 0.0  # length of the previous link (= a[i-1])

    for i, jv in enumerate(values.joints):
        js = schema.joints[i] if i < len(schema.joints) else None

        limit_lower_rad = math.radians(jv.limit_lower)
        limit_upper_rad = math.radians(jv.limit_upper)
        alpha_rad = math.radians(jv.alpha)
        theta_offset_rad = math.radians(jv.theta_offset)

        parent_link = "base" if i == 0 else f"link{i - 1}"
        child_link = f"link{i}"
        joint_name = jv.name

        # Joint — translates by prev link length along Z, applies d offset, alpha twist
        joint_el = ET.SubElement(root, "joint", name=joint_name, type="revolute")
        ET.SubElement(joint_el, "parent", link=parent_link)
        ET.SubElement(joint_el, "child", link=child_link)

        # Origin: translate by previous link length + d offset along Z
        origin_z = prev_length + jv.d
        ET.SubElement(
            joint_el,
            "origin",
            xyz=f"0 0 {origin_z:.6f}",
            rpy=f"{alpha_rad:.6f} 0 {theta_offset_rad:.6f}",
        )

        ET.SubElement(joint_el, "axis", xyz="0 0 1")
        ET.SubElement(
            joint_el,
            "limit",
            lower=f"{limit_lower_rad:.6f}",
            upper=f"{limit_upper_rad:.6f}",
            effort="50",
            velocity="3.14",
        )

        # Link — cylinder of length = a, radius = shared link_radius
        link_el = ET.SubElement(root, "link", name=child_link)
        link_length = jv.a
        half = link_length / 2.0
        mass = jv.mass
        Ixy = mass * link_length**2 / 12.0
        Izz = mass * radius**2 / 2.0

        inertial = ET.SubElement(link_el, "inertial")
        ET.SubElement(inertial, "mass", value=f"{mass:.6f}")
        ET.SubElement(inertial, "origin", xyz=f"0 0 {half:.6f}", rpy="0 0 0")
        ET.SubElement(
            inertial,
            "inertia",
            ixx=f"{Ixy:.8f}",
            ixy="0",
            ixz="0",
            iyy=f"{Ixy:.8f}",
            iyz="0",
            izz=f"{Izz:.8f}",
        )

        for geom_tag in ("visual", "collision"):
            el = ET.SubElement(link_el, geom_tag)
            geom = ET.SubElement(el, "geometry")
            ET.SubElement(
                geom,
                "cylinder",
                radius=f"{radius:.6f}",
                length=f"{link_length:.6f}",
            )
            ET.SubElement(el, "origin", xyz=f"0 0 {half:.6f}", rpy="0 0 0")

        prev_length = link_length

    # End-effector fixed joint at tip of last link
    if values.joints:
        n = len(values.joints)
        ee_joint = ET.SubElement(root, "joint", name="ee_fixed", type="fixed")
        ET.SubElement(ee_joint, "parent", link=f"link{n - 1}")
        ET.SubElement(ee_joint, "child", link="end_effector")
        ET.SubElement(ee_joint, "origin", xyz=f"0 0 {prev_length:.6f}", rpy="0 0 0")
        ET.SubElement(root, "link", name="end_effector")

    return _pretty_xml(root)


# ── Public: parameter ↔ DH-chain converters ───────────────────────────────────


def parameters_to_dh_values(
    schema: DHChainSchema,
    easy: list[EasyAlias],
    parameters: dict[str, float | str],
) -> DHChainValues:
    """
    Migrate an old-style parameters dict to DHChainValues by resolving the
    easy alias map declared in the template.  Unaliased DH fields fall back
    to their template schema defaults.
    """
    values = DHChainValues.from_schema_defaults(schema)
    for alias in easy:
        raw = parameters.get(alias.legacy_param)
        if raw is None:
            continue
        try:
            values.apply_easy_alias(alias.target, float(raw))
        except Exception:
            pass
    return values


def dh_values_to_parameters(
    easy: list[EasyAlias],
    values: DHChainValues,
) -> dict[str, float]:
    """
    Derive the legacy parameters dict from DHChainValues via the easy aliases.
    Used to keep backward-compat consumers (bind_slot, sims) working.
    """
    params: dict[str, float] = {}
    for alias in easy:
        try:
            params[alias.legacy_param] = values.read_easy_alias(alias.target)
        except Exception:
            pass
    return params


# ── Helpers ───────────────────────────────────────────────────────────────────


def _add_base_link(root: ET.Element) -> None:
    base = ET.SubElement(root, "link", name="base")
    inertial = ET.SubElement(base, "inertial")
    ET.SubElement(inertial, "mass", value="1.0")
    ET.SubElement(
        inertial,
        "inertia",
        ixx="0.01",
        ixy="0",
        ixz="0",
        iyy="0.01",
        iyz="0",
        izz="0.01",
    )
    for geom_tag in ("visual", "collision"):
        el = ET.SubElement(base, geom_tag)
        geom = ET.SubElement(el, "geometry")
        ET.SubElement(geom, "cylinder", radius="0.05", length="0.05")
        ET.SubElement(el, "origin", xyz="0 0 0", rpy="0 0 0")


def _pretty_xml(root: ET.Element) -> str:
    raw = ET.tostring(root, encoding="unicode")
    dom = minidom.parseString(raw)
    return dom.toprettyxml(indent="  ", newl="\n")
