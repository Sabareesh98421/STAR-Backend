# Product

## Register

product

## Users

A solo researcher/developer building and evaluating an unproven multi-LLM
peer-review system. Sessions are long and deep, often late at night under a
single lamp, on a large display. The same person also checks in on a running
execution from a phone, away from the desk, wanting to know what is happening
without being able to act on it in detail.

They are not a consumer. They are the person who has to decide whether the
ensemble actually produces better answers than any single model, and they need
the interface to help them make that judgement honestly.

## Product Purpose

Observe and steer N language models answering one prompt, reviewing each
other's responses, and being synthesized by a Leader that holds internet access
and RAG context.

Success is not "the app returned an answer." Success is the user being able to
see *why* the synthesized answer is better than any individual response: which
claim was challenged, by which peer, on what grounds, and what the Leader did
with that challenge.

The number of participating models is a runtime fact, not a product fact. It
will change.

## Brand Personality

Precise, quiet, legible. A research instrument, not a product demo.

Modern retro computing: monospace-inflected, structural, low chrome, high
information density without clutter. It should feel like a well-made measuring
device: everything on screen is there because it is being measured.

Voice is factual and unhurried. It reports state; it does not narrate
enthusiasm.

## Anti-references

- **Cursor, VS Code, OpenCode.** Not an IDE skin. The editor is a surface in
  this product, not the product's identity.
- **ChatGPT and its clones.** The linear user/assistant transcript is the wrong
  primary structure for an execution graph.
- **The neon-purple AI aesthetic.** No purple glows, no neon gradients, no
  saturated accent doing emotional work.
- **Dashboard slop.** No hero-metric tiles, no identical card grids, no
  decorative glassmorphism.
- Marketing tone anywhere in the product surface.

## Design Principles

1. **Execution is the content.** The run graph is the primary object. The
   message list is one view onto it, not the source of truth. Any feature that
   forces the graph back into a linear transcript is wrong.

2. **Latency is information, never absence.** Every waiting state names what is
   waiting and why. A spinner that stands alone, with no subject, is a defect.
   A slow backend produces a *detailed* frontend, not a frozen one.

3. **N is unknown.** No token, layout, component, or colour assignment may
   assume today's agent count. Agent identity is generated, never enumerated.

4. **Peer review is annotation, not argument.** A review renders as evidence
   attached to a specific claim. Never as debate, never as a scoreboard between
   models, never as a winner.

5. **The instrument stays quiet.** It reports. It does not sell, celebrate, or
   persuade. Confidence comes from precision, not emphasis.

## Accessibility & Inclusion

No formal conformance target (user's call). Non-negotiable regardless:

- Full keyboard reachability and visible focus. `04_Design_System.md` requires
  keyboard-friendly operation, and this is a tool for long sessions.
- `prefers-reduced-motion` honoured throughout. This UI streams constantly;
  perpetual agent-activity motion without an opt-out is hostile to
  vestibular-sensitive users.
- No colour-only encoding of state. Agent identity and run status must remain
  distinguishable without hue.
- Both dark and light themes are first-class, defined as tokens together.
  Neither is a filter applied to the other.
