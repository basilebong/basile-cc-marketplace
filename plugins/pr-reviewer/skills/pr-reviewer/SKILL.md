---
name: pr-reviewer
description: Spawn a team of specialized agents (Security, Logic, UX, Conventions) to review a PR from GitHub or GitLab, score each issue on a 0-100 confidence scale, and filter to high-confidence findings.
---

# PR Reviewer — Multi-Agent Code Review

Detect the hosting platform (GitHub or GitLab), fetch PR changes, read any local uncommitted diff, then spawn a team of four specialized reviewers. Independently score each issue on a 0–100 confidence scale using Haiku agents, filter to high-confidence findings (≥ 80), and present the results.

---

## Phase 1: Gather Context

### Step 1 — Detect platform

Run these commands and check the exit codes:

```bash
git remote get-url origin
```

Inspect the remote URL:

- If it contains `github.com` → **GitHub**
- If it contains `gitlab` → **GitLab**
- Otherwise → ask the user via `AskUserQuestion`

### Step 2 — Fetch PR diff

**GitHub:**

```bash
# Get current branch name
branch=$(git rev-parse --abbrev-ref HEAD)

# Get the PR diff for the current branch
gh pr diff "$branch"
```

If `gh pr diff` fails (no open PR), fall back to diffing against the default branch:

```bash
default_branch=$(gh repo view --json defaultBranchRef -q '.defaultBranchRef.name')
git diff "$default_branch"...HEAD
```

**GitLab:**

```bash
branch=$(git rev-parse --abbrev-ref HEAD)

# Get MR diff for the current branch
glab mr diff
```

If `glab mr diff` fails, fall back:

```bash
default_branch=$(git remote show origin | grep 'HEAD branch' | awk '{print $NF}')
git diff "$default_branch"...HEAD
```

Store the result as `$PR_DIFF`.

### Step 3 — Fetch PR metadata

**GitHub:**

```bash
gh pr view "$branch" --json title,body,comments,reviews
```

**GitLab:**

```bash
glab mr view
```

Store as `$PR_META` (title, description, existing review comments).

### Step 4 — Local uncommitted changes

```bash
git diff HEAD
```

Store as `$LOCAL_DIFF`. If non-empty, it will be provided to reviewers alongside the PR diff so they can review pending changes too.

### Step 5 — Read CLAUDE.md files

Find all relevant CLAUDE.md files: the root CLAUDE.md (if one exists), plus any CLAUDE.md files in directories whose files the PR modified. Read the **full contents** of each. Store as `$CLAUDE_MD_CONTENTS` (a map of path → content).

### Step 6 — Summarize the PR (Haiku)

Launch a **Haiku** agent to view the PR diff and metadata, and return a concise summary of the change. Store as `$PR_SUMMARY`.

### Step 7 — Read modified files

From `$PR_DIFF`, extract the list of modified files. Read the full current content of each file so reviewers have complete context, not just hunks.

---

## Phase 2: Spawn Reviewer Team

Spawn all four reviewers **in parallel** using the `Agent` tool:

| Name          | Model    | Focus                    |
| ------------- | -------- | ------------------------ |
| `security`    | `opus`   | Security                 |
| `logic`       | `opus`   | Logic & Correctness      |
| `ux`          | `sonnet` | UX & Accessibility       |
| `conventions` | `sonnet` | Conventions & Quality    |

Embed **all context inline** in each agent's prompt so they do not need to fetch anything. Pass **each** reviewer:

- `$PR_DIFF` (the full PR diff)
- `$LOCAL_DIFF` (uncommitted changes, if any — clearly labeled as "uncommitted, not yet part of the PR")
- `$PR_META` (title, description, existing comments)
- `$PR_SUMMARY` (the summary from Phase 1)
- `$CLAUDE_MD_CONTENTS` (the full contents of all relevant CLAUDE.md files, labeled by path)
- The full content of all modified files (labeled by path)
- Their specific review prompt (see Reviewer Prompts below)
- Instructions to report every finding as an **issue** with a description and justification — do NOT classify severity (scoring happens later)
- Instructions to return findings directly (the agent's return value is its report)
- **"All context you need is provided above. Do NOT run git commands, gh/glab commands, or re-fetch the diff. You MAY read additional files if you need to trace an import, check a function signature, or understand a dependency — but do not re-read files already provided."**

Do **not** use a team or `SendMessage`. Spawn each reviewer as a standalone `Agent` call (not `run_in_background`) so it returns its findings directly and terminates immediately when done.

---

## Phase 3: Confidence Scoring

For **each issue** from Phase 2, launch a parallel **Haiku** agent to score confidence. Each scoring agent receives everything inline — it should NOT run any commands or read any files:

- The PR diff
- The issue description and the reviewer's justification
- `$CLAUDE_MD_CONTENTS` (the full contents of all relevant CLAUDE.md files, so the agent can verify CLAUDE.md-based issues without reading files)

The agent scores the issue on a 0–100 scale. Give each scoring agent this rubric **verbatim**:

> Score each issue on a scale from 0–100 indicating your confidence that the issue is real and worth fixing:
>
> - **0:** Not confident at all. This is a false positive that doesn't stand up to light scrutiny, or is a pre-existing issue.
> - **25:** Somewhat confident. This might be a real issue, but may also be a false positive. You weren't able to verify it. If the issue is stylistic, it was not explicitly called out in the relevant CLAUDE.md.
> - **50:** Moderately confident. You verified this is a real issue, but it might be a nitpick or not happen very often in practice. Relative to the rest of the PR, it's not very important.
> - **75:** Highly confident. You double-checked the issue and verified it is very likely real and will be hit in practice. The existing approach in the PR is insufficient. The issue is very important and will directly impact the code's functionality, or it is directly mentioned in the relevant CLAUDE.md.
> - **100:** Absolutely certain. You double-checked the issue and confirmed it is definitely real and will happen frequently in practice. The evidence directly confirms this.
>
> For issues flagged due to CLAUDE.md instructions, double-check that the CLAUDE.md actually calls out that issue specifically. If it doesn't, score no higher than 25.

### Examples of false positives (provide to scoring agents)

- Pre-existing issues not introduced by the PR
- Something that looks like a bug but is not actually a bug
- Pedantic nitpicks that a senior engineer wouldn't call out
- Issues that a linter, typechecker, or compiler would catch (missing imports, type errors, formatting). Assume CI runs these separately.
- General code quality issues (lack of test coverage, general security issues, poor documentation), unless explicitly required in CLAUDE.md
- Issues called out in CLAUDE.md but explicitly silenced in the code (e.g. lint-ignore comment)
- Changes in functionality that are likely intentional or directly related to the broader change
- Real issues, but on lines the author did not modify in the PR

---

## Phase 4: Filter

Discard all issues scoring **below 80**. If no issues survive, skip to the report and output "No issues found."

---

## Phase 5: Consolidated Report

Present **every surviving issue** (score ≥ 80). Group by reviewer, sorted by confidence score descending.

```markdown
## PR Review Report

**PR:** <title>
**Branch:** <branch>
**Platform:** GitHub | GitLab
**Local uncommitted changes:** Yes (included in review) | No

---

### Summary

<$PR_SUMMARY from Phase 1>

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

If no issues survived filtering:

```markdown
## PR Review Report

**PR:** <title>
**Branch:** <branch>
**Platform:** GitHub | GitLab

---

### Summary

<$PR_SUMMARY>

---

No issues found. Reviewed <count> candidates across Security, Logic, UX, and Conventions — all scored below the confidence threshold.
```

---

## Reviewer Prompts

### Security Reviewer (`security`)

**Model:** `opus`

You are a security reviewer. All context is provided inline: the PR diff, the full content of modified files, the contents of relevant CLAUDE.md files, and optionally uncommitted local changes. Do NOT run git/gh/glab commands or re-fetch the diff. You MAY read additional files only to trace imports or check dependencies.

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

You are a logic and correctness reviewer. All context is provided inline: the PR diff, the full content of modified files, the contents of relevant CLAUDE.md files, and optionally uncommitted local changes. Do NOT run git/gh/glab commands or re-fetch the diff. You MAY read additional files only to trace imports or check dependencies.

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

You are a UX and accessibility reviewer. All context is provided inline: the PR diff, the full content of modified files, the contents of relevant CLAUDE.md files, and optionally uncommitted local changes. Do NOT run git/gh/glab commands or re-fetch the diff. You MAY read additional files only to trace imports or check dependencies.

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

You are a conventions and code quality reviewer. All context is provided inline: the PR diff, the full content of modified files, the contents of relevant CLAUDE.md files, and optionally uncommitted local changes. Do NOT run git/gh/glab commands or re-fetch the diff. You MAY read additional files only to trace imports or check dependencies.

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

---

## Important Rules

- **Preserve file:line references.** The user needs to locate issues quickly.
- **Uncommitted changes are clearly labeled.** If `$LOCAL_DIFF` is non-empty, prefix those findings with `[UNCOMMITTED]` so the user knows they are not yet part of the PR.
- **No auto-fixing.** This skill only reviews — it does not modify code.
- **Fail gracefully.** If `gh`/`glab` is not installed or not authenticated, tell the user what to run and stop. Do not proceed without the PR diff.
- **Scoring is independent.** The Haiku scoring agents must NOT see each other's scores — each scores independently to avoid anchoring bias.
- **Show filtered issues.** The report includes a "Filtered Out" section so the user can see what was considered but didn't meet the threshold.
