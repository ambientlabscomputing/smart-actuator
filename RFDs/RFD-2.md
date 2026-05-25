# RFD-2: Actuator Simulator

It's important that we develop and flesh out this idea before we even consider hardware. To this end, we will be building the actuator simulator before the real thing. This simulator will be used to build the rest of the platform around. This allows us to very quickly iterate on interfaces and functionality we'll need from the real thing.

This is the interface I envision, roughly:

**Level 1: normal actuator**

```
set_position(angle)
set_velocity(rad/s)
set_torque(Nm)
read_position()
read_velocity()
read_current()
```

**Level 2: safe actuator**

```
set_soft_limits(min, max)
set_current_limit(max)
set_temperature_limit(max)
set_control_mode(position | velocity | torque | impedance)
refuse_unsafe_command(reason)
```

**Level 3: trajectory actuator**

```
execute_trajectory_segment(points, start_time)
pause()
resume()
abort()
report_tracking_error()
```

**Level 4: semantic joint module**

```
declare_joint_role(name, parent_link, child_link)
publish_capabilities()
publish_calibration()
publish_health()
participate_in_chain_discovery()
```
