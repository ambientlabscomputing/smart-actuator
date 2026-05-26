# Smart Actuator

The Ambient Labs Smart Actuator is a motor for the new generation of makers providing a wide variety of data and control interfaces.

## Repository Conventions

- We practice document-driven development. See [RFC 3](https://datatracker.ietf.org/doc/html/rfc3). Specifically:

    ```
    The content of a NWG note may be any thought, suggestion, etc. related to
    the HOST software or other aspect of the network.  Notes are encouraged to
    be timely rather than polished.  Philosophical positions without examples
    or other specifics, specific suggestions or implementation techniques
    without introductory or background explication, and explicit questions
    without any attempted answers are all acceptable.  The minimum length for
    a NWG note is one sentence.

    These standards (or lack of them) are stated explicitly for two reasons.
    First, there is a tendency to view a written statement as ipso facto
    authoritative, and we hope to promote the exchange and discussion of
    considerably less than authoritative ideas.  Second, there is a natural
    hesitancy to publish something unpolished, and we hope to ease this
    inhibition.
    ```

    See also [RFD Guidelines](#rfd-guidelines)

- For documention, always write diagrams as `mermaid` diagrams
- We use Makefiles heavily to maintain ergonomics across languages and subprojects

### RFD Guidelines

We use Request for Discussion (RFD) instead of Request for Comment(RFC) to avoid confusion with the IETF's actual RFC's

The purpose is to ensure that we are thinking through our architectural decisions, and if the future allows, perhaps so that fellow engineers can discuss via PRs.

## Repository Layout

```
.
├── ui/                   # Web UI — TypeScript + React (future)
├── controller/           # Controller Brain — Python (future)
├── smart-actuator/       # Rust Cargo workspace
│   ├── proto/            # gRPC service definitions (source of truth)
│   ├── crates/
│   │   ├── actuator-proto/       # Generated gRPC types
│   │   ├── actuator-core/        # State machine, control modes, safety
│   │   ├── actuator-sim/         # Simulator binary (drop-in for real firmware)
│   │   ├── actuator-firmware/    # Real hardware firmware (stub)
│   │   └── controller-sidecar/   # Host-side gRPC pool + watchdog (stub)
│   └── Makefile
└── RFDs/                 # Architecture documents
```

See [RFD-3](RFDs/RFD-3.md) for the full architecture rationale.

### Running the simulator

```bash
cd smart-actuator
make run
```

## RFD Table of Contents

- [RFD-1: The Smart Actuator, foundational RFD](RFDs/RFD-1.md)
- [RFD-2: Actuator Simulator](RFDs/RFD-2.md)
- [RFD-3: Proposed Architecture](RFDs/RFD-3.md)
