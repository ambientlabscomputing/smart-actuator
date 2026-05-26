# RFD-5: Template Marketplace and Discovery

**Status:** parking lot. Captured so the idea isn't lost; not on the v1
roadmap. The Brain ([RFD-4](RFD-4.md)) is designed to be
forward-compatible with this but does not depend on it.

## Motivation

Once users can author their own [RFD-4](RFD-4.md) machine templates and
host them in git, a natural next step is making those templates
*discoverable*. Today the only sharing mechanism is informal — "here's a
link to my GitHub fork" passed around on Reddit, Discord, forums. That
works, and it is genuinely how community ecosystems start. But it
leaves real value on the table:

- A new user wanting to build "a 4-DOF arm with a gripper" has no way
  to know whether someone has already published exactly that template.
- There is no signal for which third-party templates are well-tested,
  maintained, or safe.
- There is no obvious place for Ambient to highlight community work,
  feature templates, or curate quality.
- Compatibility with current Brain / firmware versions is something
  every user has to figure out individually.

A registry-style service ("Thingiverse for robot templates" / "the npm
of smart-actuator machines") solves these, and is plausibly a real moat
for the platform long-term.

## Why this is its own RFD and not part of RFD-4

A registry is not a feature of the Brain. It is a separate product:

- It is a web service with its own backend, database, and ops story.
- It requires moderation, trust review, abuse handling, and policy.
- It is a multi-tenant system; the Brain is single-machine.
- Its lifecycle, deployment, and team are different from the Brain's.

Bolting it into the Brain RFD would conflate two products. Better to
let the Brain treat the registry as just another *source* of git-hosted
templates when the time comes.

## Sketch of what it would be

Rough, not authoritative:

- A web service (TBD where it lives) that maintains an index of
  publicly-listed templates.
- Each entry points at a git repository + ref and carries metadata:
  category, description, screenshots/diagrams, author, ratings,
  Brain/firmware compatibility, safety review status.
- A "Browse templates" view in the Web UI that hits the registry API.
- A signing / verification model:
  - **Official** — Ambient-published, signed, no warning.
  - **Verified** — third-party but reviewed by Ambient against a safety
    checklist.
  - **Community** — third-party, unreviewed. Loadable with explicit
    warning.
- A publishing flow for template authors: "submit my repo to the
  index."

## Hard parts (not solved here)

These are the parts that make this its own multi-month project rather
than a feature:

1. **Safety review at scale.** Templates encode motion limits and
   collision volumes. A bad template can hurt someone. We cannot
   manually review every community submission, but we also cannot
   pretend none of them carry risk. The "community / verified /
   official" tiering exists to manage this — the actual review process
   is the hard part.
2. **Moderation and abuse.** Malware, copyright violations,
   griefing-via-bad-templates, impersonation.
3. **Compatibility metadata.** What does "this template works with
   Brain v1.3" actually mean? How do we test it? How do we keep it
   accurate as Brain versions evolve?
4. **Hosting and cost.** Templates themselves are tiny; metadata and
   the discovery API are not zero-cost but are manageable. Screenshots,
   video assets, and growth at scale are the real cost.
5. **Trust UX.** How do we make "this template is unverified" feel
   like useful information to a kid, not legalese?
6. **Take-down policy.** If a template is found to be unsafe after the
   fact, what happens to machines built on it? Notification?
   Auto-disable?

## What RFD-4 should preserve to keep this possible

The Brain is forward-compatible with a future registry without baking
it in:

- Machine descriptions reference templates by
  `(source, template_id, version, content_hash)`. The `source` field
  is a generic identifier, today always a git URL, but
  schema-compatible with a future registry URI.
- All template loading goes through one code path that already knows
  how to surface provenance and verification status.
- The Brain has no privileged relationship with a single template
  source; the official catalogue is just the default-configured
  source.

If/when we build the registry, the Brain learns one more `source` type
and one more verification tier. That should be it.

## Status

Parked. Revisit when:

- v1 ships and we have data on how users are actually sharing
  templates informally,
- there is community demand we can point at, and
- we have organizational bandwidth for a second product.
