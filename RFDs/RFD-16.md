# RFD 16 - Next Gen Machine Design

In an internal conversatino where we demo'd Jog Actuators, an important question was asked:

> So after you design your machine, do you order it from Jog Actuators and it comes with all the screws and everything?

The answer, of course, is no. But why not? Because it's hard! And how do we know it's hard? Because we've had to start building a hardware as code framework to allow us to design our own machine and ... oh.

## The Vision

So what would this look like? To establish a trajectory I decided to look back at what the current Jog Actuator platform accomplishes for the user.

### Without Jog Actuator

```mermaid
flowchart LR
    IDEA([Machine idea]) --> ARCH[System architecture]

    ARCH --> MECH[Mechanical concept]
    MECH --> CAD[Detailed mechanical CAD]
    CAD --> DOCS[Dimensions, drawings, and part specs]
    DOCS --> BOM[Build and reconcile the BOM]
    BOM --> SOURCE[Source parts and vendors]
    SOURCE --> FAB[Fabricate and buy parts]
    FAB --> ASSEMBLE[Assemble the machine]

    ARCH --> ELEC[Electrical design]
    ELEC --> WIRING[Schematics and wiring]

    ARCH --> CONTROL[Control architecture]
    CONTROL --> SIM[Build a simulation]
    SIM --> SOFTWARE[Write motion and control software]

    ASSEMBLE --> INTEGRATE[Integrate hardware and software]
    WIRING --> INTEGRATE
    SOFTWARE --> INTEGRATE
    INTEGRATE --> TEST[Test the machine]
    TEST -. Rework and repeat .-> ARCH

    classDef manual fill:#fff4e5,stroke:#b26a00,color:#3d2500;
    classDef outcome fill:#e8f1ff,stroke:#3568a8,color:#102a43;
    class ARCH,MECH,CAD,DOCS,BOM,SOURCE,FAB,ASSEMBLE,ELEC,WIRING,CONTROL,SIM,SOFTWARE,INTEGRATE manual;
    class TEST outcome;
```

### With Jog Actuator V1

```mermaid
flowchart LR
    IDEA([Machine idea]) --> JA[Design the machine in Jog Actuator]

    subgraph SOLVED[Handled by Jog Actuator]
        direction LR
        ARCH[Architecture] --> SIM[Simulation]
        SIM --> SOFTWARE[Software and control]
    end

    subgraph MANUAL[Low-level mechanical design is still manual]
        direction LR
        TRANSLATE[Translate the procedural frame into hardware]
        TRANSLATE --> CAD[Detailed CAD]
        CAD --> DOCS[Dimensions, drawings, and part specs]
        DOCS --> BOM[Build and reconcile the BOM]
        BOM --> SOURCE[Source parts and vendors]
        SOURCE --> FAB[Fabricate and buy parts]
        FAB --> ASSEMBLE[Assemble the machine]
    end

    JA --> ARCH
    JA --> TRANSLATE
    SOFTWARE --> INTEGRATE[Integrate and test]
    ASSEMBLE --> INTEGRATE
    INTEGRATE --> MACHINE([Working machine])

    classDef jog fill:#e7f6ec,stroke:#2d7d46,color:#12351f;
    classDef manual fill:#fff4e5,stroke:#b26a00,color:#3d2500;
    classDef outcome fill:#e8f1ff,stroke:#3568a8,color:#102a43;
    class JA,ARCH,SIM,SOFTWARE jog;
    class TRANSLATE,CAD,DOCS,BOM,SOURCE,FAB,ASSEMBLE manual;
    class INTEGRATE,MACHINE outcome;
```

### With Jog Actuator V2

```mermaid
flowchart LR
    IDEA([Machine idea]) --> DESIGN[Design the machine in Jog Actuator]
    DESIGN --> MODEL[(Canonical machine model)]

    MODEL --> RUNTIME[Architecture, simulation, software, and control]
    MODEL --> FABRICATE[Fabricate workspace]

    FABRICATE --> RESOLVE[Resolve real geometry, materials, tolerances, and hardware]
    RESOLVE --> DIMENSIONS[Exact dimensions]
    RESOLVE --> CAD[CAD files: STL and STEP]
    RESOLVE --> DRAWINGS[Manufacturing drawings]
    RESOLVE --> SPECS[Part and material specs]
    RESOLVE --> ECAD[ECAD files where applicable]
    RESOLVE --> PARTS[Supplier part numbers]

    DIMENSIONS --> BOM[Complete fabrication-ready BOM]
    CAD --> BOM
    DRAWINGS --> BOM
    SPECS --> BOM
    ECAD --> BOM
    PARTS --> BOM

    BOM --> ORDER[Export or order]
    ORDER --> KIT[Parts, custom components, and every fastener]
    KIT --> ASSEMBLE[Assemble the machine]
    RUNTIME --> MACHINE([Working machine])
    ASSEMBLE --> MACHINE

    classDef jog fill:#e7f6ec,stroke:#2d7d46,color:#12351f;
    classDef artifact fill:#f2ebff,stroke:#7251a5,color:#2f1b4d;
    classDef outcome fill:#e8f1ff,stroke:#3568a8,color:#102a43;
    class DESIGN,MODEL,RUNTIME,FABRICATE,RESOLVE jog;
    class DIMENSIONS,CAD,DRAWINGS,SPECS,ECAD,PARTS,BOM artifact;
    class ORDER,KIT,ASSEMBLE,MACHINE outcome;
```

### UX

A new Fabricate workspace shows me my machine not as the control / animation friendly procedurally generated frame, instead it's a *fully rendered machine*.

The gantry is a "real" cuboid composed of aluminum extrusions with either a belt rail, a linear actuator, or a head-d4ifen rail (I choose via a UI component). 

For custom parts, I can choose between 3d printed and cnc'd metal (aluminum or stainless steel) -- the app will reocmmend me a material per part for cheapest but still within tolerance based on machine size / weight / torque / etc. (And then I can order them and jog actuators will use a 3rd party to manufacture)

In the end, I get a beautiful BOM UI (with export options of course), each item has CAD (STL + STEP), ECAD (if applicable), part number (if applicable)
