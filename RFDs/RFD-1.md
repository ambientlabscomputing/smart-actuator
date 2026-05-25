# RFD-1 : The Smart Actuator
Author: Jose Catarino

The vision:

A maker finishes asseembling their machine using Ambient Labs Smart Actuators. They open their control computer and deploy a controller container. This gives them a local UI to the controller system. In a small amount of time, the user is able to onbaord their new machine and they can start programming their machine from this UI.

```
Buy modular motors/controllers
        ↓
plug them into a local machine/controller
        ↓
install a local runtime container
        ↓
open a browser UI
        ↓
discover motors
        ↓
describe the machine
        ↓
calibrate/test safely
        ↓
program behavior with simple blocks/scripts/modes
```


## A Key Distrinction

Robot-level planner
  owns: URDF, kinematics, global path planning, collision checking

Joint cluster / limb controller
  owns: local coordination, timing, interpolation, safety envelopes

Smart actuator node
  owns: motor control, encoder feedback, limits, thermal state, torque/current limits,
        local calibration, local impedance/compliance, health reporting