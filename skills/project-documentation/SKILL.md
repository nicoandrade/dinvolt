---
name: project-documentation
description: Create concise Markdown product context for a new or undocumented project through a short user interview, connecting README.md, docs and AGENTS.md. Use when asked to start project documentation or after the user accepts a documentation suggestion.
license: MIT
---

# Project Documentation

Give future coding agents enough product context to make useful feature, workflow and copy decisions.

## Understand the project

- Read the README, AGENTS.md, existing docs and enough code to distinguish the starter from implemented product features. Reuse existing context and paths; technical setup guides alone are not product documentation.
- Ask questions and respond in the user's preferred language, defaulting to the conversation language. Write docs in their requested language, otherwise the established project documentation language, otherwise the conversation language. Starter boilerplate does not establish a language preference.
- Ask only what is missing, in small batches. Invite an informal explanation: **What is the product called, who uses it, and what problem should it solve? What should someone be able to do in the first version? What comes later?** Follow up only where needed about the main workflow, domain terms, tone or important constraints.
- Use answers already provided. Do not infer business goals from the stack or invent commitments to fill gaps. Mark unresolved decisions as pending and distinguish implemented behavior, intended initial scope and future direction.

## Write the minimum useful docs

Start with these files, adapting to existing equivalents:

| File | Purpose |
| --- | --- |
| `README.md` | Short product introduction, current status, verified startup commands and a link to the documentation index. Preserve useful setup instructions and license notices. |
| `docs/README.md` | A compact task-to-document index, including existing technical guides. |
| `docs/product.md` | Audience, problem, goal, initial scope, main workflow, future direction, terminology and copy guidance, plus unresolved decisions. |
| `AGENTS.md` | Tell agents to read product context for feature, flow and copy work, and use the index for relevant technical guides. Preserve unrelated and tool-managed instructions. |

Begin each maintained guide in `docs/`, including its index, with this frontmatter; replace the example values with concrete content in the chosen language:

```yaml
---
summary: "One sentence describing this document."
read_when:
  - A specific task or decision that needs this context
---
```

Keep this metadata on guides, not license files, generated reports or files with another required format. Keep the root README and AGENTS.md in their existing format.

Keep one explanation per topic and link to it. Add specialized guides only when there is enough real content to justify them. Put brief maintenance rules in the index: update affected docs with meaningful product changes, replace obsolete explanations, separate plans from current behavior, and keep secrets and real personal data out.

## Finish onboarding

- After writing and checking the docs, replace the suggestion inside `<!-- BEGIN:dinvolt-project-documentation -->` / `<!-- END:dinvolt-project-documentation -->` in AGENTS.md with the product/index links and reading guidance. Retain the markers; if absent, add a short context section. Never leave the initial suggestion active after documentation exists.
- If useful product documentation already exists, reuse it and remove any stale initial suggestion without restarting the interview. Update that documentation only as requested.
- Check relative links, commands against project scripts, and claims against answers and code. Report the documents created or updated and any important unresolved questions briefly.
