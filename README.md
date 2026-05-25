# Smart Actuator

The Ambient Labs Smart Actuator is a motor for the new generation of makers providing a wide variety of data and control interfaces.

Here's the current list of target interfaces:

- position
- velocity
- torque/current limit
- temperature estimate
- soft limits
- hard limits
- command queue
- local controller
- neighbor links
- latency/jitter
- fault modes

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
