# RFD-7: UI and the Product Story
Author: Jose Catarino

## Why this RFD

[RFD-1](RFD-1.md) ends with "open a browser UI" and waves at the rest.
This RFD is where the wave becomes a shape. The UI is the only piece
of the system the user actually touches, so its decisions
back-propagate hard into the Brain's REST surface, the Sidecar's
streaming contracts, and the templating story. Getting the screens
roughly right now will save us from designing the API twice.

This RFD is deliberately less settled than RFD-1–6. The point is to
surface the open questions before we start building, not to pretend
we've answered them.

## What the UI is for

The UI is the **local control plane** for one machine running on one
host. It is not a fleet manager, not a cloud service, and not a
remote-access tool. RFD-1's vision is a maker on their own bench,
plugging actuators in and getting to motion fast. Everything that
follows assumes that frame.

Concretely, the UI must let a user:

1. **Onboard a new machine.** Discover actuators, pick a template,
   describe geometry, calibrate.
2. **Drive the machine.** Jog joints, run programs, watch state, hit
   E-stop.
3. **Program the machine.** Express intent (blocks, scripts, modes)
   and iterate on it against the real or simulated robot.
4. **Recover when something is wrong.** See what the safety layer is
   complaining about and clear it.

If a screen doesn't serve one of those four, it probably doesn't
belong in v1.

## Audiences and moments

The same user is in different modes at different times. The UI has
to land them somewhere sensible in each:

- **First run.** Nothing exists. The actuators may or may not be
  plugged in. The user needs to be walked through onboarding without
  feeling walked-through.
- **Steady state.** A working machine. The user opens the UI to
  write a program, jog the arm, or check on a run. They should land
  in their last workspace, not a project picker.
- **Recovery.** Something tripped — E-stop, thermal cutoff, lost
  Sidecar heartbeat. The UI should be loudly honest about it and
  point at the next action.
- **Bring-up after a change.** A new actuator added, a link length
  changed, recalibrating. Closer to onboarding than to steady state,
  but the project already exists.

## The product story

A maker finishes wiring their machine and opens
`http://localhost:<port>` in a browser.

1. **Home.** If no projects exist, they land on a "Start a new
   project" card with template thumbnails (3-DOF arm, gantry,
   pan-tilt, custom). If projects exist, they land in the last one
   they touched, with a small breadcrumb back to the project list.
2. **Onboarding wizard (first run of a project).** Discover →
   describe → calibrate → ready. Each step has a clear "what just
   happened" panel so the user understands the state they've
   reached. Discovery shows actuators the Sidecar can see; describe
   is where the template gets parameterized (link lengths, joint
   roles); calibrate is per-actuator, guided.
3. **Workspace (steady state).** The canvas is the page. A 3D view
   of the robot in its current joint state sits in the middle. A
   left **tool rail** holds modal tools (jog, teach, measure,
   sketch a path). A **top contextual bar** changes with the
   selected tool or selection. A **right inspector** shows
   properties for whatever's selected — a joint, a waypoint, a
   program block. A persistent **status cluster** in the top-right
   shows mode, E-stop, Sidecar heartbeat, and safety state. The
   hamburger drawer from the original sketch is gone; navigation
   between projects/settings lives in a small app-menu in the
   top-left.
4. **Programming surface.** Reachable from the workspace, not a
   separate top-level destination. Blocks-first (drag motion / IO /
   control-flow blocks onto a timeline) where the blocks are a view
   on the Brain's program AST ([RFD-4](RFD-4.md) C6). A script tab
   shows the same AST as text. Running a program animates the robot
   in the canvas the user was already looking at.
5. **Settings and Projects.** Conventional list/detail pages.
   "Project" is a UI-only wrapper around a Brain machine
   description plus the programs that reference it (see Resolved
   below); the Projects page exists mostly so the user can have
   more than one machine description on the same host.

The thing to notice: the canvas is not a feature, it's the
substrate. Onboarding, jogging, teaching, and program playback all
happen on the same 3D view. Switching tools changes what the canvas
*means*, not which page you're on.

## Screen inventory

### Home

- New project (template grid) + recent projects.
- "Last opened" auto-redirect with a 1-second grace so it can be
  cancelled.

### Onboarding

Stepped flow, but each step is also a section the user can return
to later from the project's settings:

- **Discover.** Live list of actuators reported by the Sidecar.
  Each row shows ID, firmware/sim status, and whether it's been
  claimed by this project.
- **Describe.** Parameterize the chosen template. Assign discovered
  actuators to joint roles. The 3D canvas updates live as
  parameters change — this is the first time the user sees "their"
  robot.
- **Calibrate.** Per-actuator, guided. Drives the actuator's local
  calibration routines (RFD-1: "local calibration, heal").
- **Ready.** Summary + "Open workspace."

### Workspace

- **Canvas.** 3D view, dot-grid ground plane, axis gizmo,
  joint-state-driven robot pose. Click a link to select it;
  selection populates the inspector.
- **Tool rail (left).** Jog, Teach, Measure, Path, Program. Exactly
  one tool active at a time.
- **Contextual bar (top).** Tool-specific controls. In Jog: joint
  vs. cartesian, speed slider, soft-limit toggles. In Teach:
  record / clear / name waypoint. Etc.
- **Inspector (right).** Properties of current selection.
  Collapsible.
- **Status cluster (top-right).** Mode (idle/running/error), big
  E-stop button, Sidecar heartbeat dot, safety summary with a
  click-through to details.
- **Timeline / program tray (bottom, collapsible).** When the
  active tool is Program, this expands into the programming
  surface.

### Programming surface

The canonical representation is the Brain's program AST
([RFD-4](RFD-4.md) C6). The UI renders the AST as blocks; the script
tab renders the same AST as text. Both views round-trip through the
AST — there is no separate "block model" the UI owns.

- Block palette, program timeline, run/pause/step controls.
- Script tab for the same AST as text. Edits in either view mutate
  the AST; the other view re-renders from it.
- Programs are type-checked against the current machine description
  before they run ([RFD-4](RFD-4.md) C6); rejection surfaces at edit
  time, not at run time.
- Runs animate the canvas above. Errors highlight the offending AST
  node in whichever view is open.

### Settings

- Host / Sidecar connection details.
- User preferences (units, theme, keybindings).
- Diagnostics (logs tail, version info).

### Projects

- List with last-opened, machine summary, status.
- Create / duplicate / delete / export.

## API surface this implies

The UI is a client of the Brain's REST + WebSocket API
([RFD-1](RFD-1.md)). Mapping screens to the existing
`brain/interface/rest` modules:

- `actuators.py` — Discover step; per-actuator details in inspector.
- `machine.py` — Describe step; machine summary in Projects.
- `state.py` + an events/state WebSocket from `events.py` — drives
  the canvas pose, the status cluster, and the timeline's "current
  step" indicator.
- `motion.py` — Jog tool, Teach tool, Path tool.
- `mode.py` — Mode switching in the status cluster.
- `programs.py` — Programming surface (CRUD + run/pause/step).
- `events.py` — Safety / mode / lifecycle events; this is the feed
  the status cluster and the error toasts subscribe to.

What's *not* in the REST surface yet and will need to be added or
named:

- **Calibration orchestration.** `calibration_service.py` exists
  Brain-side but there's no REST module that owns the guided flow.
  Open question below.
- **Templates as a UI-visible resource.** `template_service.py`
  exists; we need a way to list templates, fetch their parameter
  schema, and instantiate one. Probably `templates.py` alongside
  the others.
- **Projects.** Resolved (see below): the Brain does not learn
  about projects. "Project" is UI-only state — last-opened machine,
  workspace layout, recent waypoints — keyed by the Brain's
  `machine_id` ([RFD-4](RFD-4.md), multi-machine future). No new
  Brain resource.

## Tech choices

Defaults, with the reasoning visible so we can argue with them
later.

- **SPA in TypeScript + React + Vite.** Already scaffolded under
  `ui/`. Matches the team's skill set and the canvas-heavy UI
  pattern.
- **3D in react-three-fiber on top of three.js.** Keeps the canvas
  declarative and React-shaped. The alternative — a separate
  canvas controller imperatively driven — is faster to write a
  demo with and harder to keep coherent as state grows.
- **State management.** Local UI state in React. Live machine
  state in a small store fed by a single WebSocket subscription
  (Zustand or Jotai; not Redux). The store is the single source of
  truth for the canvas pose, the status cluster, and the
  inspector.
- **Programming surface.** Renders the Brain's program AST
  ([RFD-4](RFD-4.md) C6). The block-editor framework is the open
  question (Blockly is faster to v1, a custom node editor is more
  on-brand); the AST is fixed regardless. Default lean: Blockly
  for v1, replace if it constrains the AST surface.
- **Served by the Brain.** The Brain serves the built UI bundle as
  static files from the same origin as the REST API. No separate
  dev server in production; no CORS surface; the URL the user
  opens *is* the controller.
- **Auth.** Token-based from day one, per [RFD-4](RFD-4.md). The UI
  does an OAuth-2.0-compatible flow against the Brain's local auth
  endpoint; the CLI and scripts use long-lived tokens minted from
  the UI. v1 is single-tenant on a LAN.

## Hard parts

These are the parts that justify the RFD existing.

1. **Streaming contract.** Resolved at the transport layer (one
   WebSocket, per-topic subscriptions \u2014 see Resolved below). What
   remains is the *rate* contract for the `state` topic: should
   the Brain pass actuator frames through at Sidecar rate or
   downsample/aggregate? Captured as Q1.
2. **Calibration as a guided flow.** Resolved: a Brain-owned
   calibration job with REST CRUD and a `calibrations/{job_id}`
   WS topic (see Resolved below). Back-propagates to
   [RFD-4](RFD-4.md) C8: the existing `calibration_service`
   primitives need a flow-orchestrator layer above them.
3. **Template parameterization.** Templates need a parameter
   schema the UI can render a form from, *and* a way for the
   canvas to reflect parameter changes live before commit. Where
   does the "preview" machine description live — UI-local, or
   Brain-side draft state?
4. **Projects vs. machines.** Resolved: project is a UI-only
   wrapper. The Brain's unit is the machine description; the UI
   keys its local state off `machine_id`. See Resolved below.
5. **Programs as durable artifacts.** Resolved upstream: the
   program AST is the canonical form ([RFD-4](RFD-4.md) C6),
   persisted by the Brain in its SQLite store, and the UI's
   blocks/script views are round-trippable renderings of it. What
   *is* still open is the UI-side undo/redo and offline-edit story
   when the Brain is unreachable — see Q2.
6. **Sim vs. real in the UI.** Resolved: per-joint binding kind
   is a first-class Brain concept; the UI surfaces a `SIM` badge
   and the "+ Add motor" flow lets the user pick real-hardware
   onboarding or sim deployment. Back-propagates to
   [RFD-3](RFD-3.md) (runtime sim peers), [RFD-4](RFD-4.md) (sim
   lifecycle as a Brain capability, per-slot binding), and
   [RFD-6](RFD-6.md) (mixed-bind dynamics scope cut). See
   Resolved.
7. **3D scene fidelity.** Resolved: primitives in v1. Meshes are
   an additive template field later, with primitive fallback when
   absent.
8. **Recovery UX.** When the Sidecar is unreachable or the Brain
   crashes, the UI is the only thing the user still sees. It has
   to degrade legibly: show what it last knew, refuse to pretend
   commands worked, and tell the user what to try.
9. **Multi-machine on one host.** Out of scope for v1, but the
   data model decisions in (4) determine whether it's easy or
   painful later. Worth naming the constraint now.
10. **Embedded vs. separately deployed UI.** Default is "Brain
    serves the bundle." Open question whether we also want a mode
    where the UI is a separately-installed app (Electron / Tauri)
    that connects to a remote Brain. Probably not v1; worth not
    designing ourselves out of it.

## Open questions

### Resolved (kept for traceability)

- **"Project" is a UI-only wrapper.** The Brain has no project
  resource. A project is local UI state — last-opened machine,
  workspace layout, recent waypoints, view preferences — keyed by
  the Brain's `machine_id` ([RFD-4](RFD-4.md), multi-machine
  future). When the UI is reinstalled or moved to another browser,
  projects rebuild themselves from the Brain's machine list; only
  the cosmetic layer is lost. Multiple projects on one host means
  multiple machine descriptions in the Brain, which the data model
  already supports.
- **Program canonical form.** The Brain's program AST
  ([RFD-4](RFD-4.md) C6) is canonical. The UI never holds a
  separate "block document" — blocks and the script tab are both
  views on the AST, and both round-trip through it. The AST is
  persisted Brain-side in SQLite. The UI keeps a local working
  copy for in-flight edits and commits to the Brain on save.
- **Auth.** Token-based from day one, per [RFD-4](RFD-4.md). Not
  a UI-level open question.
- **WebSocket shape.** One WebSocket, multiplexed by topic. The UI
  opens a single connection at `WS /events` (or similar) and
  subscribes/unsubscribes to topics over it: `state`, `events`,
  `mode`, `programs/{id}/run`, etc. One connection keeps auth,
  reconnect, and backpressure logic in one place; topics keep
  rate-mismatched streams (high-rate joint state vs. low-rate
  mode changes) from forcing each other's pacing. Subscriptions
  are per-topic so a backgrounded canvas can drop `state` without
  losing `events`.
- **Brain frontending of the actuator stream.** Negotiated rate
  per subscription. The UI declares the rate it wants when
  subscribing to the `state` topic; the Brain downsamples Sidecar
  frames to that rate. The canvas asks for 60 Hz; a diagnostics
  view can ask for full Sidecar rate. The Brain's "Modeled" topic
  ([RFD-4](RFD-4.md) C5) is separate and rate-negotiable
  independently. **Back-propagates to [RFD-4](RFD-4.md):** the
  Sidecar bridge needs to expose per-subscriber rate control, and
  the REST/WS surface needs a subscription protocol that carries
  a rate parameter.
- **3D fidelity in v1.** Render from primitives — cylinders for
  links, spheres/discs for joints, a small triangle wedge for the
  base. Templates do not ship meshes in v1. This matches the
  honesty of "this is the level of fidelity we actually have" and
  removes a real support burden from template authors. Meshes
  become an additive template field later; the renderer falls
  back to primitives when no mesh is provided.
- **Block-editor framework.** Custom node editor, drawing from
  visual-scripting patterns in game engines (Unreal Blueprints,
  Unity Visual Scripting, Houdini) rather than Blockly. Blockly
  reads as children's-app to our audience; node-graph patterns
  read as professional tooling and map more naturally onto the
  program AST ([RFD-4](RFD-4.md) C6), where most nodes have
  multiple typed inputs/outputs and execution flow is a
  first-class wire rather than implicit nesting. Custom is real
  engineering effort and is explicitly accepted as cost.
- **Calibration shape.** A first-class **calibration job** model
  on the Brain, addressed by `job_id`, with a dedicated REST
  module and live progress on the existing WS via a
  `calibrations/{job_id}` topic. Calibration is multi-step,
  state-bearing, and interactive (it prompts the user for
  physical actions and waits for confirmation), so events alone
  are the wrong shape — there's no good way to address "this
  specific session" or to reattach from a new tab.

  Concrete REST sketch (under the machine-scoped path from
  [RFD-4](RFD-4.md)'s multi-machine future):

  - `POST /machines/{mid}/actuators/{aid}/calibrations` — start a
    routine (`encoder_offset`, `range_sweep`, `friction_model`,
    …); returns `{job_id, initial_state}`.
  - `GET  /machines/{mid}/calibrations/{job_id}` — current state,
    current step, last measurement, current prompt for the UI to
    display.
  - `POST /machines/{mid}/calibrations/{job_id}/advance` — user
    confirms a physical action; the job advances.
  - `POST /machines/{mid}/calibrations/{job_id}/abort`.
  - `WS topic: calibrations/{job_id}` — step transitions,
    measurement updates, prompt changes, completion.

  Whole-machine calibrations (tool frame, base frame) use the
  same shape, scoped at the machine instead of an actuator.

  **Back-propagates to [RFD-4](RFD-4.md):** the existing
  `calibration_service.py` carries primitives; this resolution
  asks for a *flow orchestrator* layer above those primitives
  that owns the per-job state machine, plus a new REST module
  (`calibrations.py`) and a calibrations topic on the events WS.
  Worth its own paragraph in C8.
- **Per-joint binding and sim-vs-real surfacing.** The Brain
  tracks each joint slot's binding as one of `unbound`, `real`,
  or `sim`, with the sim case carrying a Brain-owned handle to a
  deployed `actuator-sim` process. The UI workflow is per-joint:
  click a joint, "+ Add motor," choose **Onboard real hardware**
  (walks the user through pairing a discovered actuator from the
  Sidecar) or **Add simulated**, which asks the Brain to deploy a
  sim and bind it to that slot. The Brain owns sim lifecycle
  (spawn, health, teardown) and exposes it as an actuator
  property; the UI surfaces a `SIM` badge wherever an actuator is
  shown and in the status cluster if any slot is sim.

  This supersedes the old "bind discovered actuators in order"
  story from [RFD-4](RFD-4.md) C1 — binding is now per-slot, and
  a *mixed* machine (some joints real, some sim) is legal. That
  enables the "design before you build" flow: stand up a machine
  fully simulated, then swap sims for real actuators one at a
  time as you assemble.

  **Back-propagates to [RFD-4](RFD-4.md):** new Brain capability
  for sim lifecycle ("deploy a sim, track its health, tear it
  down"), extension of C1's binding model from "bind in order" to
  per-slot kind-aware binding, and a `kind` field on actuator
  state in C5. **Back-propagates to [RFD-3](RFD-3.md):** the
  Sidecar must accept sim peers spawned at runtime, not just at
  startup. **Back-propagates to [RFD-6](RFD-6.md):** mixed-bind
  machines complicate the shared-world story — the shared MuJoCo
  world cannot accurately couple real and sim joints. v1 stance
  worth pinning: when a machine is fully sim, sims attach to the
  shared world; in mixed binds, sims fall back to per-sim
  isolated dynamics. Mixed-bind whole-machine dynamics is
  explicitly out of scope.
- **Live template-parameter preview.** The UI renders from the
  machine-description DSL ([RFD-4](RFD-4.md) C1), not from the
  expanded URDF. URDF expansion is a Brain concern; the UI never
  sees it. The renderer takes the DSL (`template_id`, parameter
  values, bindings) and draws primitives directly from it
  (cylinders sized by segment-length params, joints positioned
  by mount-angle params, etc.). During parameterization the UI
  edits its local copy of the DSL; the renderer reacts
  synchronously to those mutations, and the working copy syncs
  to the Brain in the background. This is the same pattern as
  the program-AST working copy (see Resolved above) — UI holds
  the in-flight edits, Brain holds the canonical persisted form.

  Consequence: templates must expose enough geometry on their
  parameter surface for the UI's primitive renderer to lay out
  the machine without URDF. In practice that is already the
  case — segment lengths and mount angles are exactly what the
  renderer needs. Templates that hide structural geometry behind
  closed-form URDF expansion would break this; v1 templates are
  expected not to.
- **Offline edits are disallowed.** The Brain and the UI's
  static-bundle origin are served from the same container; if
  the Brain is unreachable, the user is looking at a crashed
  controller, not a network blip. The UI refuses edits in that
  state. The working copies (program AST, machine-description
  DSL) become read-only mirrors of the last known canonical
  form; in-flight uncommitted edits are discarded with a clear
  banner ("controller lost — your unsaved edits were discarded;
  reconnect to continue"). Recovery UX (hard part #8) is built
  on this assumption rather than on reconcile-on-reconnect
  logic. Revisit only if/when we add a separately-deployed UI
  mode (hard part #10).

### Open

None at this time. All of the Resolved items above started as open
questions in this RFD; further decisions belong in follow-up RFDs.

## Non-goals

- Fleet / multi-machine / multi-host UI.
- Remote access, cloud sync, accounts.
- Mobile-first responsive layout. The UI assumes a laptop or
  desktop with a real pointing device.
- A general-purpose 3D editor. The canvas only ever shows *this*
  machine and what it's doing.

## Phasing

- **Phase 0 (today).** Vite + React scaffold under `ui/`. No
  screens yet.
- **Phase 1.** Workspace canvas wired to a joint-state stream
  against a simulated machine. Jog tool. Status cluster with
  E-stop. No persistence; project is implicit.
- **Phase 2.** Onboarding flow against a single template. Real
  Discover / Describe / Calibrate. UI-side project wrapper lands:
  last-opened machine and workspace layout persisted in browser
  storage, keyed by the Brain's `machine_id`.
- **Phase 3.** Programming surface, blocks-first, rendering the
  Brain's program AST ([RFD-4](RFD-4.md) C6). Script tab as a
  second view on the same AST.
- **Phase 4.** Settings, multi-project, polish, recovery UX.

## Relationship to other RFDs

- **[RFD-1](RFD-1.md):** this RFD is the "open a browser UI" step
  made concrete.
- **[RFD-2](RFD-2.md):** the UI consumes the Brain's REST + WS
  surface; it never talks to the Sidecar or actuators directly.
- **[RFD-3](RFD-3.md), [RFD-6](RFD-6.md):** the UI is agnostic to
  sim-vs-real except where Q6 says otherwise.
- **[RFD-4](RFD-4.md):** the Brain's MuJoCo is a planning tool;
  the UI's 3D view is joint-state-driven and does not need to
  subscribe to MuJoCo state.

## Status

All open questions raised in this RFD are now resolved (see
Resolved above): project scope, program canonical form, transport,
stream rate control, 3D fidelity, block-editor approach,
calibration shape, per-joint sim-vs-real binding, live
template-parameter preview against a UI-side DSL working copy,
and offline edits.

Several resolutions back-propagate into other RFDs:

- **[RFD-4](RFD-4.md):** sim lifecycle as a Brain capability,
  per-slot kind-aware binding in C1, `kind` on actuator state in
  C5, a calibration-flow orchestrator + `calibrations.py` REST
  module in C8, and a per-subscriber rate parameter on the WS
  stream surface.
- **[RFD-3](RFD-3.md):** Sidecar accepts sim peers spawned at
  runtime.
- **[RFD-6](RFD-6.md):** mixed-bind machines fall back to
  isolated per-sim dynamics; the shared MuJoCo world is fully-sim
  only.

Those edits belong in their respective RFDs; this RFD records the
direction.
