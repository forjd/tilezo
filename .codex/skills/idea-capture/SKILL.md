---
name: idea-capture
description: Capture and append product, design, engineering, gameplay, UX, or planning ideas to Tilezo's docs/IDEAS.md file. Use when the user asks to note down, jot down, capture, record, save, add, or remember an idea, brainstorm item, future feature, TODO-like concept, or rough thought for the project.
---

# Idea Capture

## Workflow

1. Append ideas to `docs/IDEAS.md` in the current Tilezo repository.
2. If `docs/IDEAS.md` does not exist, create it with `# Ideas` as the first line.
3. Get the current timestamp from the environment before editing. Prefer `date '+%Y-%m-%d %H:%M %Z'`.
4. Add each idea as a new level-2 section at the end of the file.
5. Preserve existing content and ordering. Do not rewrite, sort, deduplicate, or remove older ideas unless the user explicitly asks.

## Entry Format

Use this Markdown shape for every idea:

```markdown
## <Title>

Added: <YYYY-MM-DD HH:MM TZ>

<Summary>

<Additional details, context, constraints, examples, open questions, or bullets if provided.>
```

Requirements:

- Title: create a concise title from the user's idea when one is not provided.
- Summary: write one short paragraph that captures the core idea.
- Additional info: include any amount of supporting detail from the user. Keep their intent intact, but make rough notes readable.
- Timestamp: record when the idea was added, not when it might be implemented or reviewed.
- Multiple ideas: append one complete section per idea with its own title, summary, details, and timestamp.

## Editing Notes

- Use `apply_patch` for edits.
- If the user only gives a vague idea, still capture it with a clear title and summary rather than asking for more detail.
- If the idea is outside current Tilezo product scope, record it anyway unless the user asks for implementation.
- Keep the file as plain Markdown. Do not add frontmatter, tables, generated IDs, status fields, or ownership metadata unless the user asks.
