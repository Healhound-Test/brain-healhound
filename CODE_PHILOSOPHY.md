# Code Philosophy

Write simple, readable, straightforward code.

## Principles

- Prefer the clearest solution that satisfies the current requirement.
- Use explicit names that reveal purpose and avoid unnecessary indirection.
- Keep functions, modules, and components focused on one responsibility.
- Make data flow and dependencies visible.
- Handle errors directly and return messages that help someone act.
- Add dependencies only when they remove more complexity than they introduce.
- Avoid premature abstractions, speculative features, and clever shortcuts.
- Comment to explain why a non-obvious choice exists; let clear code explain what it does.
- Test observable behavior with the smallest useful test.
- Refactor when duplication or complexity is real, not merely possible.

When two designs work, choose the one a new contributor can understand and change with less context.
