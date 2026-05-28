# RFD-10: The Testbench Actuator
Author: Jose Catarino

## Why this RFD

[RFD-8](RFD-8.md) calls J6 the **architecture validation journey**:
one real actuator and one simulated actuator bound into the same
machine, indistinguishable to the Brain and UI except for a `SIM`
badge. The whole sim/real abstraction from [RFD-2](RFD-2.md) and
[RFD-3](RFD-3.md) lives or dies on that journey.

This RFD pins down the **physical thing** that plays the role of
"real actuator" in J6. It is deliberately not the final Smart
Actuator product — that is firmware-and-PCB work covered elsewhere.
The Testbench Actuator is the minimum hardware rig that can:

1. Speak the same `actuator.proto` gRPC surface as `actuator-sim`,
   over a host-side serial/USB bridge.
2. Close a position loop tightly enough that J6's "real joint tracks
   target within tolerance" exit criterion is reachable.
3. Be built on a wooden base board in an afternoon with off-the-shelf
   parts, so anyone on the team can replicate it.

If the abstraction is right, swapping `actuator-sim` for this rig
should require zero changes in the Brain or the UI. That is the
test.

## Bill of materials

| Role | Part (suggested) | Why this part |
|---|---|---|
| MCU | ESP32-WROOM-32 dev board | dual-core, USB-serial onboard, cheap, has enough pins for stepper + encoder + sensors |
| Stepper motor | NEMA 17, 1.8°/step, ~0.4 Nm | small enough for a desk rig, plenty of torque for a single joint |
| Stepper driver | TMC2209 (StealthChop / UART) | quiet, current-tunable over UART, integrated diag flag for stall |
| Magnetic rotary encoder | AS5600 (I²C, 12-bit absolute) | absolute angle on the output shaft, no homing dance, no quadrature counting |
| Current sensor | INA219 (I²C, high-side) or shunt + INA169 | measures motor-rail current for fault detection and load estimation |
| Temperature sensor (optional) | NTC 10K thermistor on ADC, or DS18B20 | clamp-mounted to the stepper driver heat sink |
| Host | MacBook (any dev machine) | runs the Brain + Sidecar + UI; talks to the ESP32 over USB-CDC serial |
| Mechanical | wooden base board (~30×20 cm), L-bracket for the stepper, M3 hardware, magnet glued to shaft for the AS5600 | one fixed reference plane keeps the encoder/shaft alignment honest |
| Power | 12 V / 2 A bench supply for the stepper rail; ESP32 powered from USB | separates motor noise from the MCU logic rail |

**Cost target:** under $80 for one rig, excluding the laptop and
bench supply. If a rig costs more than that, we are probably building
the wrong thing.

## Role inside the J6 system

```mermaid
flowchart LR
    UI[UI]
    BR[Brain]
    SC[Sidecar]
    TBA[Testbench Actuator firmware on ESP32]
    SIM[actuator-sim]

    UI <-->|WS + REST| BR
    BR <-->|gRPC| SC
    SC <-->|gRPC over USB-CDC| TBA
    SC <-->|gRPC over loopback| SIM
```

From the Sidecar's perspective the Testbench is just another
`actuator.proto` peer. The transport differs (USB-CDC framed gRPC
vs. loopback TCP), but discovery and control are the same. That is
the property J6 is testing.

## Electrical

```mermaid
flowchart TD
    ESP[ESP32]
    ST[Stepper]
    SD[Stepper Driver TMC2209]
    CS[Current Sensor INA219]
    TP[Temp Sensor NTC 10K Optional]
    RE[Mag Rotary Encoder AS5600]
    PS[12V Bench PSU]
    MC[Macbook]

    MC -->|USB CDC serial| ESP
    PS -->|12V rail| SD
    PS -->|GND| ESP
    ESP -->|STEP, DIR, EN| SD
    ESP <-->|UART tuning| SD
    SD -->|4 wire coils| ST
    SD -->|VM in| CS
    CS -->|sensed VM out| SD
    ESP <-->|I2C SDA, SCL| CS
    ESP <-->|I2C SDA, SCL| RE
    ESP -->|ADC| TP
```

### Signal table

| Net | ESP32 pin (suggested) | Notes |
|---|---|---|
| STEP | GPIO 25 | high-speed timer-driven; ≥ 1 µs pulse width |
| DIR | GPIO 26 | latched before STEP edge |
| EN | GPIO 27 | active-low; default high (driver disabled) until firmware ready |
| UART TX → driver RX | GPIO 17 | configure run/hold current at boot, read DIAG |
| UART RX ← driver TX | GPIO 16 | |
| I²C SDA | GPIO 21 | shared bus: AS5600 (0x36) + INA219 (0x40) |
| I²C SCL | GPIO 22 | 400 kHz |
| Thermistor ADC | GPIO 34 | input-only ADC pin; voltage divider to 3V3 |
| Common GND | — | star ground at the PSU side to keep encoder I²C clean |

### Notes the wiring diagram is not allowed to lie about

- The INA219 sits on the **high side** of the motor rail (between the
  PSU and the driver's `VM`), not between driver and motor. Putting
  it between driver and motor means measuring chopped current, which
  the INA219 will alias.
- The AS5600 needs the diametric magnet centered on the shaft axis,
  ~1–3 mm from the IC face. Mount it on the shaft end opposite the
  load to keep the magnetic field away from the stepper coils.
- The ESP32 ground and the PSU ground must be tied together, but the
  ESP32 should be USB-powered, not from the 12 V rail. Cheap bench
  supplies inject enough noise to crash the MCU mid-run.

## Physical

```mermaid
flowchart TD
    BS[Wooden Base Board]
    ESP[ESP32]
    ST[Stepper]
    SD[Stepper Driver]
    CS[Current Sensor]
    TP[Temp Sensor Optional]
    RE[Mag Rotary Encoder]
    MC[Macbook]
    AR[Indicator Arm on shaft]

    MC -->|USB to| ESP
    ESP -->|Bolted onto| BS
    SD -->|Bolted onto| BS
    ESP -->|Wired to| SD
    CS -->|Bolted onto| BS
    ESP -->|Wired to| CS
    ST -->|L-bracket bolted to| BS
    CS -->|Wired in series with| ST
    ESP -->|Wired to| TP
    TP -->|Clamped to| SD
    ESP -->|Wired to| RE
    RE -->|Mounted facing shaft end of| ST
    AR -->|Press-fit on output shaft of| ST
```

### Mounting notes

- The stepper is the **only** part that moves. Everything else bolts
  flat to the base board so that vibration from the stepper doesn't
  loosen the encoder alignment over a session.
- The L-bracket holding the stepper is the single mechanical
  reference. If the bracket flexes, the encoder reads angle the load
  doesn't actually have. Use a thick aluminum bracket, not 3D
  printed.
- The indicator arm (a printed pointer or a piece of stiff wire)
  press-fits on the output shaft. It exists for two reasons:
  (1) a human standing next to the rig can immediately see whether
  the motor moved at all, and (2) it gives J6's "real joint tracks
  target" exit criterion a visual confirmation independent of the
  encoder.

## Firmware split

The ESP32 firmware lives in
[smart-actuator/crates/actuator-firmware](smart-actuator/crates/actuator-firmware/),
the stub crate already in the workspace. It is divided into three
layers, smallest to largest:

1. **Hardware driver layer.** Step pulse generation (RMT or LEDC
   peripheral), I²C drivers for AS5600 and INA219, UART config of
   the TMC2209. Pure embedded code; no gRPC.
2. **Control layer.** A PD loop at 1 kHz: target position → step
   rate, with current and temperature read out as state for the
   protocol layer. Limits enforced here: max current, max
   temperature, max step rate.
3. **Protocol layer.** Framed gRPC over USB-CDC, implementing exactly
   the same `actuator.proto` server surface as `actuator-sim`. This
   is the layer the Sidecar talks to.

The control loop runs on one core; the protocol layer runs on the
other. The hand-off between them is a single shared `JointTarget` /
`JointState` pair behind a critical section. No queues, no
allocations on the hot path.

## Calibration & home

Because the AS5600 is **absolute**, there is no homing dance in the
mechanical sense — power-on already gives you a real angle.
"Calibration" for this rig means two things:

1. **Zero offset.** The user puts the indicator arm at the visually
   "home" pose, then sends a `set_home` RPC. The firmware records
   the current AS5600 reading as the zero offset in flash.
2. **Encoder-to-output direction.** Sign convention has to match
   what the kinematics layer in the Brain expects. The Brain's
   calibration service ([RFD-3](RFD-3.md)) handles this by
   commanding a small positive motion and confirming the sign of
   the resulting encoder delta. If it is negative, the firmware
   flips its sign convention and persists that too.

Both of these belong in flash, not RAM. Power-cycling the rig must
not require redoing them.

## Safety

The Testbench is small enough that an out-of-control motion mostly
just makes noise. But J6 also exercises the safety hot path, so the
rig has to respect it:

- **Driver `EN` is wired to the E-stop chain.** Pulling E-stop on
  the Brain side propagates through the Sidecar to a gRPC call that
  the firmware honors by deasserting `EN` within one control tick.
- **Current limit in firmware, not just driver.** The TMC2209's
  current setting protects the silicon. The firmware also clamps
  commanded current against the value declared in the actuator's
  capability descriptor, so a buggy program cannot overdrive the
  motor via "valid" gRPC commands.
- **Temperature watchdog.** If the optional NTC is present and
  reads above the configured threshold, firmware refuses further
  motion and emits a fault on the next state frame. The Brain
  surfaces this the same way it surfaces any sim-side fault — the
  abstraction does not leak.

## Bring-up checklist

The first time a freshly-built rig is plugged in, in order:

1. **Power-on with `EN` high (driver disabled).** Confirm the ESP32
   enumerates as a USB-CDC device on the laptop.
2. **I²C sweep.** Firmware logs detected addresses; expect 0x36
   (AS5600) and 0x40 (INA219). If either is missing, stop — wiring
   is wrong.
3. **Spin-by-hand test.** Rotate the shaft by hand; AS5600 readings
   should sweep monotonically. If they jump, the magnet is off-axis.
4. **Open-loop step test.** Issue a slow constant step rate at very
   low current; confirm the encoder follows. Catches reversed coil
   pairs.
5. **Closed-loop step.** Enable the PD loop, command +1 rad, observe
   the indicator arm rotate roughly 57°. Catches sign errors and
   gross gear-ratio bugs.
6. **Sidecar handshake.** Start the Sidecar with the rig's serial
   port in its discovery config; confirm the rig appears in
   `discovered-but-unbound`.
7. **End-to-end.** Bind the rig as the `real` slot in J6's mixed
   machine and run a J5 program. Real joint tracks target; sim
   joint tracks target; no special cases anywhere.

## What this RFD does not cover

- **PCB design.** The Testbench is jumper-wire and breadboard-grade
  on purpose. A proper PCB belongs in the Smart Actuator product
  RFD, not here.
- **Multiple-joint rigs.** A two-joint Testbench is a natural next
  step for shared-world physics validation (J7), but it does not
  block J6. Out of scope.
- **The actuator gRPC surface itself.** That is
  [RFD-9](RFD-9.md)'s job.

## Open questions

1. **Driver choice: TMC2209 vs. closed-loop step driver.** A
   closed-loop driver (e.g. iHSS57) would do the position loop in
   hardware and we'd lose the encoder/PD work in firmware. Trade-off
   is cost (~4×) and obscured failure modes. Lean: TMC2209 + AS5600
   for visibility now; revisit when the rig becomes a permanent
   fixture.
2. **Transport: USB-CDC framed gRPC vs. WiFi gRPC.** USB is simpler,
   has known latency, and survives wifi being down. WiFi removes
   the cable. Lean: USB for J6; WiFi is a "nice to have" later and
   does not affect the abstraction test.
3. **Where firmware-side fault codes live.** Probably alongside the
   actuator capability descriptor in [RFD-9](RFD-9.md). Flagged
   here because the Testbench is the first thing that will actually
   emit one.