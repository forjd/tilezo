---
name: idea-triage
description: Audit and manage Tilezo's docs/IDEAS.md statuses. Use when the user asks whether ideas have been implemented, wants implemented ideas marked off, wants partial ideas separated from complete work, or wants caveats and next steps captured in FOLLOW_UPS.md.
---

# Idea Triage

## Purpose

Use this skill to review existing Tilezo ideas against the repository and update idea status metadata when the user asks. This skill complements `idea-capture`: use `idea-capture` for appending new ideas, and use this skill for auditing, marking, and follow-up management.

## Workflow

1. Read `docs/IDEAS.md`.
2. Inspect relevant code, tests, docs, scripts, migrations, and package scripts with `rg`/`rg --files`.
3. Classify each relevant idea as:
   - `implemented`: clear repo evidence shows the described first version exists.
   - `partial`: core pieces exist, but an explicit behavior or acceptance point remains missing.
   - `not started`: no meaningful product implementation exists.
   - `blocked`: implementation is prevented by a known dependency or decision.
4. Only add `Implemented: <YYYY-MM-DD>` to `docs/IDEAS.md` for `implemented` ideas.
5. For `partial` ideas, do not mark implemented unless the user explicitly chooses to accept the remaining caveat. Capture the caveat in `FOLLOW_UPS.md`.
6. Leave `not started` and `blocked` ideas unmarked unless the user asks for extra status fields.
7. Report the final status briefly, including any files changed.

## Evidence Rules

- Treat tests, source code, migrations, protocol types, scripts, and docs as evidence.
- Prefer direct implementation evidence over filename or TODO matches.
- Do not treat load-test clients as in-game NPCs or bots.
- Do not treat stored configuration as complete behavior when the join path or user flow does not enforce it.
- If evidence is ambiguous, classify as `partial` or `not started` and explain the uncertainty.

## Editing Rules

- Preserve the existing order and wording of `docs/IDEAS.md`.
- Add `Implemented: <YYYY-MM-DD>` directly below the `Added:` line.
- Get the implementation marker date from the current environment. Prefer `date '+%Y-%m-%d'`.
- If `FOLLOW_UPS.md` does not exist, create it with `# Follow Ups`.
- Add follow-ups as level-2 sections with a concise title and one short paragraph of missing work.
- Use `apply_patch` for manual edits.

## Output

When only auditing, provide a compact status table. When editing, summarize the markers and follow-ups added, and mention that no tests were run for docs-only changes.
