---
name: implement
description: Plan, implement, and review a feature or refactor using an agent team. Loops until reviewer approves or 3 rounds exhausted.
---

# Implement — Agentic Plan-Implement-Review Loop

Orchestrate a team of specialized agents: a planner (exploration), an implementer (coding), and four standalone code reviewers with confidence scoring (same review style as `pr-reviewer`). The planner and implementer communicate via `SendMessage`; reviewers are standalone agents scored by Haiku. Loop until approved or 3 rounds exhausted.

## Setup

1. Read the user's task from the args passed to this skill (everything after `/implement`).
2. Check `.claude/specs/` for any existing specification for this feature. If found, read it.
3. Get the current git diff to understand any existing changes on the branch: `git diff HEAD`
4. Create the agent team.

```
TeamCreate: team_name="implement", description="Plan-implement-review loop for: <task>"
```

---

## Phase 1 — Exploration & Planning

Spawn a **planner** agent:

```
Agent tool:
  subagent_type: "Plan"
  team_name: "implement"
  name: "planner"
  model: "opus"
```

Pass the planner:

- The user's task description
- Any relevant spec content from `docs/specs/`
- The current branch name and any existing diff
- Instructions to **actively explore the codebase** — read relevant files, search for existing patterns, understand how similar features are implemented — before producing the plan
- **The plan must be implementation-ready**: precise enough that a developer can start coding immediately without needing to explore the codebase themselves. Every change must specify exact file paths and exact locations (function name, line range). Where relevant, reference example files/snippets the implementer should mirror. The implementer writes the code — the planner's job is to eliminate all ambiguity about *where* and *how*.
- Instructions to send the plan to the moderator via `SendMessage` once ready
- Instructions to then **stay alive and wait** — the implementer may send questions via `SendMessage`, and the planner should answer them with additional codebase lookups, then send the answer back via `SendMessage` to the implementer

The planner must send a message in this format:

```
## Implementation Plan

### Goal
<one sentence>

### Changes

#### `path/to/file.ts` (create | modify)

**Why:** one-line reason for this change

**Where:** exact function/class/line-range where the change goes

**What:** description of what to add/change/remove

**Example to follow:** (only if relevant) cite a specific file + line range that uses the same pattern

(repeat for each change location)

### Out of Scope
- things explicitly not being done
```

**Critical:** The planner must read every file it references. Every file path, function name, and line range must come from actual file reads during exploration — never guessed.

Wait for the planner's `SendMessage`. Capture the plan. The planner stays alive for the duration of the implementation phase.

---

## Phase 2 — Implementation + Review Loop

Set `round = 1`. Set `reviewer_feedback = ""`.

### Loop (max 3 rounds):

#### Step A — Implement

Spawn an **implementer** agent:

```
Agent tool:
  subagent_type: "general-purpose"
  team_name: "implement"
  name: "implementer"
  model: "sonnet"
```

Pass the implementer:

- The user's task
- The implementation plan from Phase 1
- If `round > 1`: the reviewer feedback from the previous round (issues scoring ≥ 80 with confidence scores), with instructions to fix all high-confidence issues
- **Instructions to start coding immediately** — the plan contains exact file paths, locations, and what to change. Do not re-explore the codebase; go straight to writing code based on the plan.
- **Role: Senior architect-level developer.** Write clean, readable, type-safe, and secure code. Follow best practices and established conventions in the codebase. Every decision should prioritize correctness, safety, and maintainability.
- Instructions to work directly on the current branch (no worktree)
- Instructions to follow all project rules from CLAUDE.md (frontend rules, backend rules, etc.)
- Instructions NOT to commit — just modify files
- Instructions to use `SendMessage` to the `planner` agent only if something in the plan is genuinely unclear or wrong, and wait for the planner's `SendMessage` reply before continuing
- Instructions to use `SendMessage` to the moderator when done, with a summary of what was changed

Wait for the implementer's completion `SendMessage`. Forward any planner↔implementer exchanges as needed.

Shut down the implementer when done:
```
SendMessage type="shutdown_request" to "implementer"
```

#### Step B — Collect diff

Run: `git diff HEAD`

If the diff is empty and round == 1, report to the user that no changes were made and stop.

#### Step C — Review

Read all relevant CLAUDE.md files: the root CLAUDE.md (if one exists), plus any CLAUDE.md files in directories whose files were modified. Store as `$CLAUDE_MD_CONTENTS`.

Spawn four reviewer agents **in parallel** as **standalone `Agent` calls** (not team-based, no `SendMessage`):

| Name          | Model    | Focus                    |
| ------------- | -------- | ------------------------ |
| `security`    | `opus`   | Security                 |
| `logic`       | `opus`   | Logic & Correctness      |
| `ux`          | `sonnet` | UX & Accessibility       |
| `conventions` | `sonnet` | Conventions & Quality    |

Pass each reviewer **all context inline** so they do not need to fetch anything:

- The full `git diff HEAD` output
- The full content of all modified files (read them locally)
- `$CLAUDE_MD_CONTENTS` (the full contents of all relevant CLAUDE.md files, labeled by path)
- The implementation plan from Phase 1
- Their specific review instructions (see Reviewer Prompts below)
- Instructions to report every finding as an **issue** with a description and justification — do NOT classify severity (scoring happens later)
- Instructions to return findings directly (the agent's return value is its report)
- **"All context you need is provided above. Do NOT run git commands. You MAY read additional files if you need to trace an import, check a function signature, or understand a dependency — but do not re-read files already provided."**

Each reviewer returns its findings directly and terminates. Collect all findings.

#### Step D — Confidence Scoring

For **each issue** from Step C, launch a parallel **Haiku** agent to score confidence. Each scoring agent receives everything inline — it should NOT run any commands or read any files:

- The git diff
- The issue description and the reviewer's justification
- `$CLAUDE_MD_CONTENTS` (so the agent can verify CLAUDE.md-based issues without reading files)

The agent scores the issue on a 0–100 scale. Give each scoring agent this rubric **verbatim**:

> Score each issue on a scale from 0–100 indicating your confidence that the issue is real and worth fixing:
>
> - **0:** Not confident at all. This is a false positive that doesn't stand up to light scrutiny, or is a pre-existing issue.
> - **25:** Somewhat confident. This might be a real issue, but may also be a false positive. You weren't able to verify it. If the issue is stylistic, it was not explicitly called out in the relevant CLAUDE.md.
> - **50:** Moderately confident. You verified this is a real issue, but it might be a nitpick or not happen very often in practice. Relative to the rest of the changes, it's not very important.
> - **75:** Highly confident. You double-checked the issue and verified it is very likely real and will be hit in practice. The existing approach is insufficient. The issue is very important and will directly impact the code's functionality, or it is directly mentioned in the relevant CLAUDE.md.
> - **100:** Absolutely certain. You double-checked the issue and confirmed it is definitely real and will happen frequently in practice. The evidence directly confirms this.
>
> For issues flagged due to CLAUDE.md instructions, double-check that the CLAUDE.md actually calls out that issue specifically. If it doesn't, score no higher than 25.

**Examples of false positives (provide to scoring agents):**

- Pre-existing issues not introduced by the new changes
- Something that looks like a bug but is not actually a bug
- Pedantic nitpicks that a senior engineer wouldn't call out
- Issues that a linter, typechecker, or compiler would catch (missing imports, type errors, formatting). Assume CI runs these separately.
- General code quality issues (lack of test coverage, general security issues, poor documentation), unless explicitly required in CLAUDE.md
- Issues called out in CLAUDE.md but explicitly silenced in the code (e.g. lint-ignore comment)
- Changes in functionality that are likely intentional or directly related to the broader change

**Scoring is independent.** The Haiku scoring agents must NOT see each other's scores — each scores independently to avoid anchoring bias.

#### Step E — Filter & Verdict

Discard all issues scoring **below 80**. Apply verdict rules:

- `APPROVE` — no issues scored ≥ 80
- `BLOCKED` — one or more issues scored ≥ 80

**If APPROVE or round == 3:** exit the loop. Go to Phase 3.

**If BLOCKED and round < 3:** set `reviewer_feedback` = full list of issues scoring ≥ 80 with file:line references and confidence scores. Increment `round`. Go back to Step A (spawn a new implementer).

---

## Phase 3 — Cleanup & Report

Shut down the planner:

```
SendMessage type="shutdown_request" to "planner"
```

Call `TeamDelete` to clean up the team.

Report to the user:

```markdown
## Result

**Rounds:** <N>
**Final Verdict:** APPROVE | BLOCKED (max rounds reached)

---

### Issues Found: <count> (from <total pre-filter count> candidates)

---

### Security (Opus)

- [<score>] `file:line` — description + justification

---

### Logic & Correctness (Opus)

- [<score>] `file:line` — description + justification

---

### UX & Accessibility (Sonnet)

- [<score>] `file:line` — description + justification

---

### Conventions & Quality (Sonnet)

- [<score>] `file:line` — description + justification

### Filtered Out (<count> issues below threshold)
- [<score>] <reviewer>: <brief description> — reason for low confidence
```

If verdict is APPROVE and no issues found, report:

```markdown
## Result

**Rounds:** <N>
**Final Verdict:** APPROVE

No issues found. Reviewed <count> candidates across Security, Logic, UX, and Conventions — all scored below the confidence threshold.
```

If verdict is APPROVE, suggest the user run `/commit` to commit the changes.

If max rounds reached with BLOCKED verdict, list all remaining high-confidence issues so the user can fix them manually.

---

## Reviewer Prompts

### Security Reviewer (`security`)

**Model:** `opus`

You are a security reviewer. All context is provided inline: the git diff, the full content of modified files, the contents of relevant CLAUDE.md files, and the implementation plan. Do NOT run git commands. You MAY read additional files only to trace imports or check dependencies.

Note any security-related rules from the provided CLAUDE.md contents.

Find: XSS, SQL injection, command injection, SSRF, path traversal, hardcoded secrets/credentials, authentication and authorization gaps, missing input validation at system boundaries, insecure data exposure, unsafe deserialization, CSRF vulnerabilities, open redirects.

For each finding, explain the attack vector and impact. Do NOT classify severity — just report the issue with justification.

Format:

```
### Security

- file:line — description + attack vector + impact
- file:line — description + attack vector + impact
```

Return your findings as your final output.

---

### Logic & Correctness Reviewer (`logic`)

**Model:** `opus`

You are a logic and correctness reviewer. All context is provided inline: the git diff, the full content of modified files, the contents of relevant CLAUDE.md files, and the implementation plan. Do NOT run git commands. You MAY read additional files only to trace imports or check dependencies.

Note any correctness-related rules from the provided CLAUDE.md contents.

Trace every changed function path. Find: wrong boolean conditions, missing null/undefined checks, off-by-one errors, race conditions, broken async/await chains, unhandled promise rejections, stale closures, infinite loops or recursion, incorrect state transitions, unhandled edge cases, type mismatches that slip past the compiler.

For each finding, explain why it's a bug and the expected impact. Do NOT classify severity — just report the issue with justification.

Format:

```
### Logic & Correctness

- file:line — description + justification
- file:line — description + justification
```

Return your findings as your final output.

---

### UX & Accessibility Reviewer (`ux`)

**Model:** `sonnet`

You are a UX and accessibility reviewer. All context is provided inline: the git diff, the full content of modified files, the contents of relevant CLAUDE.md files, and the implementation plan. Do NOT run git commands. You MAY read additional files only to trace imports or check dependencies.

Note any UX/accessibility-related rules from the provided CLAUDE.md contents.

Evaluate: user-facing flows (are they intuitive?), feedback states (loading, error, success, empty states — are they all handled?), accessibility (keyboard navigation, screen reader support, focus management, ARIA attributes, color contrast), i18n readiness (are all user-facing strings translatable?), responsive behavior, form UX (validation feedback, disabled states, required field indicators).

For each finding, explain the user impact. Do NOT classify severity — just report the issue with justification.

Format:

```
### UX & Accessibility

- file:line — description + user impact
- file:line — description + user impact
```

Return your findings as your final output.

---

### Conventions & Quality Reviewer (`conventions`)

**Model:** `sonnet`

You are a conventions and code quality reviewer. All context is provided inline: the git diff, the full content of modified files, the contents of relevant CLAUDE.md files, and the implementation plan. Do NOT run git commands. You MAY read additional files only to trace imports or check dependencies.

The provided CLAUDE.md contents are your primary source of truth for project conventions. Also check `.claude/` rules if referenced.

Common things to look for:

- **Frontend:** no `as` type assertions, no `Optional[...]`, correct import order, `Box`/`List`/`Flex`/`FlexItem` from `@moblin/chakra-ui` (not Chakra Stack/VStack/HStack), correct i18n usage (`intl.$t()` / `FormattedMessage`), icons via `@ul/icons` with `<Icon as={...}>`, no `.otherwise()` in ts-pattern matches, proper form patterns with React Hook Form
- **Backend:** `str | None` not `Optional[str]`, `get_val()` in serializer `validate()`, no N+1 queries (check for `select_related`/`prefetch_related`), proper error arrays in ValidationError
- **General:** naming conventions (PascalCase components, camelCase hooks, kebab-case files), dead code, unnecessary complexity, missing error handling at system boundaries, performance issues (queries in loops, missing memoization where clearly needed)

For each finding, cite the convention source (CLAUDE.md rule, code comment, etc.). Do NOT classify severity — just report the issue with justification.

Format:

```
### Conventions & Quality

- file:line — description + convention reference
- file:line — description + convention reference
```

Return your findings as your final output.
