# RFD-12: Prismatic Joints and the Cartesian Gantry Template
Author: Jose Catarino

## Why this RFD

The Smart Actuator has, to date, treated "joint" as a synonym for
"revolute joint." Every shipped template — the 2-DOF planar arm, the
3-DOF anthropomorphic arm, the 6-DOF spherical-wrist arm, the 7-DOF
DLR — is built from revolutes. The G-code pipeline that landed
alongside [RFD-11](RFD-11.md) translates G0/G1/G2/G3 into Cartesian
`MOVE_SE3` nodes and then asks an IK solver to find joint angles for
a revolute arm.

That works as a tech demo. It does not match what almost any G-code
user actually owns. The G-code audience — Klipper, GRBL, Marlin,
LinuxCNC — runs Cartesian machines: 3-axis routers, 3D printers, pen
plotters, laser cutters, foam cutters. Asking those users to translate
their workflow onto a revolute arm is asking them to take on a worse
machine for their job. We need to meet them on their existing
hardware.

The plumbing is already half-built. `JointType.PRISMATIC` exists in
[brain/brain/models/machine.py](brain/brain/models/machine.py); a
`prismatic` IK block kind is registered in
[brain/brain/service/ik/registry.py](brain/brain/service/ik/registry.py);
the DH forward-kinematics in
[brain/brain/service/dh_fk.py](brain/brain/service/dh_fk.py) already
handles prismatic joints; the solver stub in
[brain/brain/service/ik/blocks/single_axis.py](brain/brain/service/ik/blocks/single_axis.py)
is a no-op `return current_q`. What is missing is (a) a real
Cartesian IK block, (b) a shipped Cartesian template, (c) URDF
generation that emits `<joint type="prismatic">` correctly, and (d)
UI that renders linear motion sensibly instead of pretending every
joint rotates.

This RFD scopes that work as one journey.

## Non-goals

- Mixed serial-and-parallel kinematics. CoreXY, H-bot, delta, and
  SCARA are all out of scope here. Their kinematics are interesting
  but each one is a separate decomposition; adding them after a clean
  PPP chain is straightforward, adding them before is premature.
- Tool-change support (multi-extruder, ATC spindles). The gantry
  template ships with a single TCP; multi-tool lands later.
- Closed-loop dynamics for the prismatic axes (acceleration shaping,
  jerk limits, lookahead). The motion service applies the same trap
  profile as it does for revolutes; quality-of-motion improvements
  are a separate RFD.
- A fourth (A/B/C) rotary axis on the gantry. The "3+1" CNC story is
  out of scope for v1; it lands after the basic XYZ rig is real.

## The work, layer by layer

### 1. Models and DH

`JointType.PRISMATIC` already exists. The DH chain schema needs no
changes — DH naturally expresses prismatic joints by treating `d` (or
`a`) as the variable parameter instead of `theta`. The
forward-kinematics code in `dh_fk.py` already branches on joint type.

What needs to land:

- **Joint limits in metres**, not radians, for prismatic joints.
  Today `limit_lower` / `limit_upper` are stored in radians; for a
  prismatic the same fields need to carry metres. The template YAML's
  `unit` field already supports `m`; the storage layer needs to stop
  assuming radians for limits.
- **Joint state `position` unit follows the joint type.** Revolute
  joints emit radians; prismatic joints emit metres. The wire format
  is unchanged (a float); the *interpretation* is per-joint. The UI's
  joint-data panel needs to read the joint type and render the unit
  string accordingly.

### 2. IK — the `cartesian_xyz` block

The existing `solve_prismatic` stub treats a single prismatic joint
the same way `solve_revolute` treats a single revolute: as a no-op,
because one DOF cannot satisfy a Cartesian target. That is the right
behaviour for a single joint in a larger chain.

What is new is a **`cartesian_xyz` decomposition block** that covers
three orthogonal prismatic joints and solves trivially:

```
q = target_xyz - base_origin
```

(With optional axis swaps and sign flips for machines whose +X axis
points the "wrong way" — encoded in the DH chain's `alpha` and
`theta_offset` fields, not in the solver.)

This block belongs in
[brain/brain/service/ik/blocks/cartesian.py](brain/brain/service/ik/blocks/cartesian.py)
(new file), registered in `registry.py` under the kind
`cartesian_xyz`. The verifier in
[brain/brain/service/ik/verifier.py](brain/brain/service/ik/verifier.py)
needs a check that the three joints have mutually orthogonal axes —
if the geometry is not orthogonal, the block fails verification and
the composer falls back to numeric, exactly as it does for revolute
decompositions today.

`task_space` gains a sensible default of `r3` for Cartesian chains;
the existing `planar_xy` / `planar_xz` modes work unchanged for 2-axis
plotters (PP chains).

### 3. The shipped template — `cnc_3axis_gantry`

A new template directory:

```
brain/templates/cnc_3axis_gantry/
  template.yaml
  model.urdf.j2
```

The kinematic chain is three prismatic joints in series: X-base
slides along world +X; Y-carriage slides along world +Y; Z-spindle
slides along world +Z. End-effector offset places the TCP at the tool
tip.

Default parameters target a recognisable hobby footprint — a
300 × 300 × 100 mm working envelope, leadscrew-style travel, modest
mass per axis. The IK block is `cartesian_xyz` over joints [0,1,2].
Joint limits are stored in metres.

The URDF template needs to emit `<joint type="prismatic">` with
`<axis>` and `<limit lower upper>` in metres. The existing
`dh_urdf.py` writes `<joint type="revolute">` unconditionally; that
needs to read the joint type from the DH chain.

### 4. URDF generation

`brain/brain/service/dh_urdf.py` currently assumes revolute. Two
changes:

- Branch on `joint.type` when emitting `<joint type="...">`.
- For prismatic joints, the link geometry should render as a slider
  (a long thin box along the joint axis) rather than a cylinder
  around the joint axis. This is cosmetic but it is what makes the
  3D viewport read as "gantry" instead of "weird arm." See §6.

### 5. G-code pipeline integration

The translator in
[brain/brain/service/gcode/translator.py](brain/brain/service/gcode/translator.py)
already emits `MOVE_SE3` nodes with `motion_type` ∈ {rapid, feed,
arc}. For a Cartesian gantry, the IK solve on each pose is a single
subtraction, so the runtime cost collapses — no Jacobian iteration,
no branch selection.

What needs verifying:

- Arc interpolation in the XY / XZ / YZ planes already produces
  Cartesian poses; the Cartesian IK turns them into joint targets
  one-to-one. No change to the translator.
- Feed rates in mm/min map directly to joint velocities in m/s; the
  motion service already accepts per-joint velocity scales.
- The G-code sample programs in
  [brain/brain/service/gcode/samples.py](brain/brain/service/gcode/samples.py)
  (square, circle, etc.) become *useful demos* on a gantry — on an
  arm they were technically correct but visually awkward.

### 6. UI rendering

The UI's `Joint.tsx` component renders every joint as a rotating
cylinder. For prismatic joints, that is wrong; the joint should
render as a sliding rail with a carriage block on it. Two pieces of
work:

- **`Joint.tsx`**: branch on joint type. Revolute → existing
  cylinder. Prismatic → a fixed rail primitive (long thin box along
  the joint axis) plus a carriage primitive that translates along
  the rail by the joint's current position.
- **`JointDataPanel.tsx`**: render units from the joint type. Show
  `mm` for prismatic, `°` (or `rad`) for revolute. The wire format
  stays SI (metres / radians); the formatting layer adapts.
- **`MachineEditor.tsx` / onboarding**: the template picker grid
  needs a thumbnail for the gantry. The parameter form already
  reads units from the template's DH field specs, so metres-vs-degrees
  comes through for free.

### 7. The jog story

Cartesian jog (`CartesianJogPanel.tsx`) becomes the *primary* jog
modality for a gantry. The existing per-joint jog still works (it
just commands a prismatic joint directly), but the natural mental
model for a router operator is "jog X +10 mm" — which is what the
Cartesian panel already does. No new component is needed; the
existing one becomes the default tab when the machine is detected as
Cartesian.

## Worked example: square on a gantry

The same `brain gcode-samples -n square -o ./out` invocation that
already works on a revolute arm becomes a 200 mm × 200 mm square cut
on a 3-axis gantry. End-to-end:

1. User onboards `cnc_3axis_gantry`, accepts defaults.
2. User uploads `square.gcode` (or runs the sample generator).
3. G-code translator emits a `Program` whose root is a SEQUENCE of
   `MOVE_SE3` nodes at Z = 150 mm.
4. ProgramService runs each node; IK is the `cartesian_xyz` block;
   joint targets are `(x_mm/1000, y_mm/1000, z_mm/1000)` in metres.
5. UI shows three sliding axes tracing the square; the
   CartesianJogPanel mirrors the TCP position live.

If the abstraction is right, *no Python code path* needs a
"gantry vs. arm" branch beyond what is listed in §6. The Brain treats
a PPP machine as just another DH chain. That is the test.

## Exit criteria

1. `cnc_3axis_gantry` template loads and onboards cleanly. The 3D
   viewport shows three orthogonal sliding axes.
2. Cartesian jog moves each axis to within ±0.5 mm of the requested
   target.
3. The `square` G-code sample runs to completion on the gantry; TCP
   traces the square within ±1 mm at the corners.
4. `GET /machines/{mid}` reports `kind: "prismatic"` for the three
   slots, with limits in metres.
5. Mixed-template smoke: onboard a 2-DOF arm and a gantry in
   succession (separate machines, same Brain). Both work; no
   global state leaks between them.

## Open questions

1. **Unit handling at the joint-state boundary.** Today every joint
   `position` is a float and the consumer assumes radians. The
   cleanest fix is to keep the wire format unit-less and have the UI
   look up the unit from the joint type. Alternative: tag each joint
   state with a `unit` string. Tagging is more explicit but adds bytes
   to every state frame at 30 Hz. Recommendation: keep the wire
   format unit-less, derive at the edge.

2. **Workspace visualisation for a gantry.** A revolute arm's
   workspace is a swept volume; a gantry's workspace is a box. The
   existing reachability overlay code assumes the former. Out of scope
   for v1, but worth noting before it becomes a surprise.

3. **Parallel kinematics as a future extension.** CoreXY and H-bot
   are PP chains with a mixing matrix between motor torques and axis
   motion. The IK is still trivially Cartesian; the *binding* maps
   one axis to a linear combination of two motors. This is a clean
   extension of the binding model from [RFD-4](RFD-4.md) C1 — but it
   needs its own RFD.

4. **Does this unblock or delay J6?** Prismatic joints touch zero
   Rust code; J6's firmware lives in `actuator-firmware/`. The two
   journeys can run in parallel. A linear actuator (leadscrew +
   stepper) is arguably *easier* hardware than a rotary one and could
   become an alternative or additional J6 testbench — see
   [RFD-10](RFD-10.md).

## Relationship to other RFDs

- **[RFD-4](RFD-4.md):** prismatic joints exercise C1 (binding) and
  C4 (kinematics) without adding new capabilities — the existing
  ones generalise.
- **[RFD-8](RFD-8.md):** this work runs in parallel with J6. It does
  not change the journey sequencing.
- **[RFD-11](RFD-11.md):** no AST changes. `MOVE_JOINT` already
  takes a `target_rad` field that for prismatic joints will carry
  metres; the field name is misleading and should be renamed to
  `target` with a per-joint-type interpretation. This is the only
  AST-visible breakage.

## Status

Draft. Ready to start work in parallel with [RFD-8](RFD-8.md) J6.
