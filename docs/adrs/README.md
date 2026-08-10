# Architecture Decision Records

Technical patterns and conventions (how we build).

## File Naming

Use format: `{prefix}__{name}.md`

| Prefix       | Technology Area                   |
| ------------ | --------------------------------- |
| `store__`    | Zustand, outbox, sync, polling    |
| `db__`       | Database, Drizzle, Turso          |
| `ui__`       | Components, UX patterns           |
| `security__` | Auth, passwords, headers          |
| `testing__`  | Playwright, linting, code quality |
| `global__`   | Cross-cutting concerns            |

## Format

ADRs should follow this structure:

```markdown
# ADR: Short Title

One-liner stating the decision clearly.

- Key reason or context
- Trade-off considered
- Important consequence

## Examples (optional)

Code snippets when helpful.
```

## Guidelines

- Be succinct and decision-oriented
- Add small examples/cheatsheets when they clarify the pattern
- Prioritize the most important points
- All ADRs in this folder are accepted (no status needed)
