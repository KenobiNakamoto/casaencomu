# Documents

Six core documents and one product-improvement proposal package, each with a defined purpose.
The proposal separates current findings from future behavior and gives implementation and
validation instructions.

| File | What it answers | Read it when |
|---|---|---|
| [`PLAN.md`](PLAN.md) | What is built, what is deliberately left out, and the trigger that brings each cut thing back | first, and before proposing a new feature |
| [`SCAFFOLD.md`](SCAFFOLD.md) | How to build and deploy it, step by step, with a check after each | you are implementing, deploying, or setting up the server |
| [`WORKPLAN.md`](WORKPLAN.md) | Who does what, in which order, and when a milestone is done. One issue owns one file set | you are an agent about to take an issue |
| [`STATUS.md`](STATUS.md) | What is actually done, what is not, what is blocked and on whom | you are picking up the work, or asking "where are we?" |
| [`PORTALS.md`](PORTALS.md) | What each listing site actually serves, measured | you are changing the extractor or a photo host |
| [`PRIOR-ART.md`](PRIOR-ART.md) | Which existing products were considered, and why this is still built | someone asks "does this already exist?" |
| [`product-improvement/README.md`](product-improvement/README.md) | Detailed UX, visual, motion, map, and family-review improvements, with ordered implementation tasks | planning or implementing the proposed product improvements |

Three documents live outside this folder on purpose:

- [`README.md`](../README.md) — the front door for a first-time reader.
- [`CLAUDE.md`](../CLAUDE.md) — loaded automatically by Claude Code from the repository root.
- [`DESIGN.md`](../DESIGN.md) — the design skills look for it at the project root, under that exact name.

Superseded versions of `PLAN.md` and `SCAFFOLD.md` are in `_archive/`, which is not committed.

## Conventions in these documents

- A path inside backticks is relative to the repository root — `src/lib/extract.ts`, never with
  a `../` prefix. Two exceptions, both stated where they apply: inside this folder a sibling
  document is named bare (`SCAFFOLD.md`), and `src/README.md` counts from `src/`. Markdown links
  are relative to the file they are in, so that they work on GitHub.
- A date in a heading means the content was measured or decided on that date, not that it was
  reviewed since.
- `ponytail` in a comment or a heading marks a deliberate simplification. It names the ceiling and
  the upgrade path; it is not an apology.
- The section numbers in `SCAFFOLD.md` are stable and are referenced from code comments and from
  issues. Do not renumber them.
