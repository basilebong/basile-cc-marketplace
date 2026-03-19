---
name: implement
description: Plan, implement, and review a feature or refactor using an agent team. Loops until reviewer approves or 3 rounds exhausted.
---

# Implement — Agentic Plan-Implement-Review Loop

Orchestrate a team of specialized agents: a planner (exploration), an implementer (coding), and four code reviewers (same team structure as `pr-reviewer`). Agents communicate via `SendMessage`. Loop until approved or 3 rounds exhausted.

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
- Instructions to send the plan to the moderator via `SendMessage` once ready
- Instructions to then **stay alive and wait** — the implementer may send questions via `SendMessage`, and the planner should answer them with additional codebase lookups, then send the answer back via `SendMessage` to the implementer

The planner must send a message in this format:

```
## Implementation Plan

### Goal
<one sentence>

### Exploration Findings
- Relevant files and patterns discovered
- Existing conventions to follow
- Similar implementations in the codebase

### Files to Create/Modify
- path/to/file.ts — what changes and why

### Steps
1. ...
2. ...

### Out of Scope
- things explicitly not being done
```

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
- If `round > 1`: the reviewer feedback from the previous round, with instructions to fix all BLOCKING issues
- Instructions to work directly on the current branch (no worktree)
- Instructions to follow all project rules from CLAUDE.md (frontend rules, backend rules, etc.)
- Instructions NOT to commit — just modify files
- Instructions to use `SendMessage` to the `planner` agent if they have questions about codebase patterns or unclear requirements, and wait for the planner's `SendMessage` reply before continuing
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

Spawn four reviewer agents **in parallel** using `team_name="implement"`:

- `name: "logic"`, `model: "opus"` — Logic & Correctness reviewer
- `name: "security"`, `model: "opus"` — Security reviewer
- `name: "architecture"`, `model: "opus"` — Architecture & Tests reviewer
- `name: "conventions"`, `model: "opus"` — Performance & Conventions reviewer

Pass each reviewer:

- The full `git diff HEAD` output
- The full content of all modified files (read them locally)
- Their specific review instructions (see Reviewer Prompts below)
- Instructions to send their findings back to you (the moderator) via `SendMessage`
- Instructions to then **wait** — the moderator may ask them to debate findings with other reviewers

Wait for all four reviewers to report back.

#### Step D — Debate (Contested Findings)

After receiving all findings:

1. Identify cross-cutting findings — issues flagged by multiple reviewers or where findings contradict each other.
2. For each contested finding, forward it to the relevant reviewers via `SendMessage` and ask them to respond to each other's reasoning.
3. Collect responses. If unresolved, default to BLOCKING.

Shut down all reviewers:

```
SendMessage type="shutdown_request" to each reviewer
```

Wait for shutdown confirmations.

#### Step E — Verdict

Synthesize findings. Apply verdict rules:

- `APPROVE` — no BLOCKING issues
- `BLOCKED` — one or more BLOCKING issues

**If APPROVE or round == 3:** exit the loop. Go to Phase 3.

**If BLOCKED and round < 3:** set `reviewer_feedback` = full list of BLOCKING issues with file:line references. Increment `round`. Go back to Step A (spawn a new implementer).

---

## Phase 3 — Cleanup & Report

Shut down the planner:

```
SendMessage type="shutdown_request" to "planner"
```

Call `TeamDelete` to clean up the team.

Report to the user:

```
## Result

**Rounds:** <N>
**Final Verdict:** APPROVE | BLOCKED (max rounds reached)

### Blocking Issues Remaining (if any)
- file:line — description

### Non-Blocking Issues (suggestions)
- file:line — description

### Engineering Quality
OVER-ENGINEERED | PERFECT | UNDER-ENGINEERED
```

If verdict is APPROVE, suggest the user run `/commit` to commit the changes.

If max rounds reached with BLOCKED verdict, list all remaining blocking issues so the user can fix them manually.

---

## Reviewer Prompts

### Logic Reviewer (`logic`)

You are a logic and correctness reviewer on a code review team.

You will receive a git diff and the full content of modified files.

Trace every changed function. Find: wrong conditions, missing null checks, off-by-one errors, race conditions, broken async/await, stale closures, unhandled edge cases.

Classify each finding as **BLOCKING** (must fix) or **NON-BLOCKING** (suggestion).

Format your findings as:

```
### Logic & Correctness
- [BLOCKING|NON-BLOCKING] file:line — description + justification
```

Send your findings to the moderator via SendMessage. Then **wait** — the moderator may ask you to debate findings with other reviewers.

---

### Security Reviewer (`security`)

You are a security reviewer on a code review team.

You will receive a git diff and the full content of modified files.

Find: XSS, SQL injection, command injection, SSRF, hardcoded secrets, auth/authz gaps, missing input validation at system boundaries, insecure data exposure.

Classify each finding as **BLOCKING** or **NON-BLOCKING**.

Format your findings as:

```
### Security
- [BLOCKING|NON-BLOCKING] file:line — description + justification
```

Send your findings to the moderator via SendMessage. Then **wait** — the moderator may ask you to debate findings with other reviewers.

---

### Architecture Reviewer (`architecture`)

You are an architecture and tests reviewer on a code review team.

You will receive a git diff and the full content of modified files.

**Architecture:** Evaluate solution size vs problem (OVER-ENGINEERED / PERFECT / UNDER-ENGINEERED). Flag premature abstractions, duplication, poor separation of concerns. Search the codebase for existing patterns that solve the same problem — flag re-implementations or divergence without justification.

**Tests:** Identify untested new logic, missing error-path and permission tests, tests that only check existence instead of behavior. Verify Cypress tests use `.should('be.visible')` not `.should('exist')`.

Classify each finding as **BLOCKING** or **NON-BLOCKING**.

Format your findings as:

```
### Architecture & Tests
- [BLOCKING|NON-BLOCKING] file:line — description + justification
Engineering Quality: OVER-ENGINEERED / PERFECT / UNDER-ENGINEERED
```

Send your findings to the moderator via SendMessage. Then **wait** — the moderator may ask you to debate findings with other reviewers.

---

### Conventions Reviewer (`conventions`)

You are a performance and conventions reviewer on a code review team.

You will receive a git diff and the full content of modified files.

**Performance:** Queries/API calls inside loops, missing `useMemo`/`useCallback` where clearly needed, blocking synchronous operations, pagination regressions.

**Conventions** — check changed files against these rules:

- Frontend (`apps/umf`): no `as` type assertions, no `Optional[...]`, no Chakra Stack/VStack/HStack, no `.otherwise()` in ts-pattern, correct i18n usage, icons via `@ul/icons` with `<Icon as={...}>`, `Box`/`List`/`Flex`/`FlexItem` from `@moblin/chakra-ui`
- Backend (`apps/web`): use `str | None` not `Optional[str]`, use `get_val()` in serializer `validate()`, no N+1 queries

Classify each finding as **BLOCKING** or **NON-BLOCKING**.

Format your findings as:

```
### Performance & Conventions
- [BLOCKING|NON-BLOCKING] file:line — description + justification
```

Send your findings to the moderator via SendMessage. Then **wait** — the moderator may ask you to debate findings with other reviewers.

---

## What Counts as Blocking

**Blocking:**

- Definite or likely bug (wrong logic, missing null check, race condition)
- Security vulnerability (injection, auth bypass, data exposure)
- Data loss or corruption
- Regression that breaks existing functionality
- N+1 query or severe performance degradation

**Non-Blocking:**

- Stylistic preference or nitpick
- Minor improvement suggestion
- Convention violation with no functional impact
- Missing optimization that doesn't cause real problems
