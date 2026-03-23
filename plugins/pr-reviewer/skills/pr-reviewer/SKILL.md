---
name: pr-reviewer
description: Spawn a team of specialized agents (Security, Logic, UX, Conventions) to review a PR from GitHub or GitLab, classify issues as blocking/non-blocking, and present a consolidated verdict.
---

# PR Reviewer — Multi-Agent Code Review

Detect the hosting platform (GitHub or GitLab), fetch PR changes, read any local uncommitted diff, then spawn a team of four specialized reviewers. Collect every finding and present a consolidated report.

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

### Step 5 — Read modified files

From `$PR_DIFF`, extract the list of modified files. Read the full current content of each file so reviewers have complete context, not just hunks.

---

## Phase 2: Spawn Reviewer Team

Create the team:

```
TeamCreate: team_name="pr-review", description="PR review for: <PR title>"
```

Spawn all four reviewers **in parallel** using the `Agent` tool:

| Name          | Model    | Focus                    |
| ------------- | -------- | ------------------------ |
| `security`    | `opus`   | Security                 |
| `logic`       | `opus`   | Logic & Correctness      |
| `ux`          | `sonnet` | UX & Accessibility       |
| `conventions` | `sonnet` | Conventions & Quality    |

Pass **each** reviewer:

- `$PR_DIFF` (the full PR diff)
- `$LOCAL_DIFF` (uncommitted changes, if any — clearly labeled as "uncommitted, not yet part of the PR")
- `$PR_META` (title, description, existing comments)
- The full content of all modified files
- Their specific review prompt (see Reviewer Prompts below)
- The names of all other reviewers on the team (`security`, `logic`, `ux`, `conventions`) so they can message each other directly
- Instructions to classify every finding as **BLOCKING** or **NON-BLOCKING**
- Instructions to end with a verdict: **APPROVE** (no blocking issues) or **BLOCK** (one or more blocking issues)
- Instructions to send findings back to the moderator via `SendMessage`, then **wait** — the moderator will share all findings and initiate a cross-review challenge round

Wait for all four reviewers to send their findings via `SendMessage`.

---

## Phase 3: Cross-Review Challenge Round

After collecting all four initial reports, initiate a **challenge round** where reviewers actively scrutinize each other's findings. This is not optional — it always happens.

### Step 1 — Share all findings

Send each reviewer a `SendMessage` containing the **full findings from all other reviewers**. Include a clear instruction:

> "Here are the findings from the other three reviewers. Your job now is to **challenge** them:
>
> 1. **Challenge BLOCKING findings you think are wrong or overstated** — explain why the severity should be downgraded or the finding dropped entirely. Be specific: cite the code, explain why the concern doesn't apply.
> 2. **Challenge APPROVE verdicts where you think the other reviewer missed something** in your area of overlap. For example: Security might notice the Logic reviewer missed an auth check; Conventions might notice the UX reviewer missed an i18n string.
> 3. **Escalate your own NON-BLOCKING findings** if another reviewer's findings reveal they should actually be BLOCKING (e.g., you flagged a missing null check as NON-BLOCKING, but Logic found a code path that actually hits it).
> 4. **Concede** if another reviewer's challenge of your own finding is valid — explicitly say 'I concede [finding X], downgrading to NON-BLOCKING' or 'I concede [finding X], dropping it'.
>
> Do NOT rubber-stamp. If everything looks correct, say so and explain why — but look hard. Send your challenges back to the moderator via `SendMessage`."

### Step 2 — Collect challenges

Wait for all four reviewers to respond with their challenges.

### Step 3 — Resolve disputes

For each disputed finding (where a reviewer challenged another's finding):

1. Forward the challenge to the original reviewer via `SendMessage`, along with the challenger's reasoning.
2. The original reviewer must either **defend** (with specific code-level justification) or **concede**.
3. Wait for the response. One round of defense is enough.
4. If the original reviewer defends convincingly, keep the finding at its original severity.
5. If the defense is weak or the reviewer concedes, adjust the severity.
6. If genuinely unresolvable, default to **BLOCKING** — err on the side of caution.

### Step 4 — Shutdown

Shut down all reviewers:

```
SendMessage type="shutdown_request" to each reviewer
```

Call `TeamDelete` to clean up.

---

## Phase 4: Consolidated Report

Present **every** finding from **every** reviewer. Do not omit, summarize away, or merge findings. Group by reviewer, then by severity.

```markdown
## PR Review Report

**PR:** <title>
**Branch:** <branch>
**Platform:** GitHub | GitLab
**Local uncommitted changes:** Yes (included in review) | No

---

### Final Verdict: APPROVE | BLOCK

**Blocking issues:** <count>
**Non-blocking issues:** <count>

---

### Security (Opus)

**Verdict:** APPROVE | BLOCK

#### Blocking
- `file:line` — description + justification

#### Non-Blocking
- `file:line` — description + justification

---

### Logic & Correctness (Opus)

**Verdict:** APPROVE | BLOCK

#### Blocking
- `file:line` — description + justification

#### Non-Blocking
- `file:line` — description + justification

---

### UX & Accessibility (Sonnet)

**Verdict:** APPROVE | BLOCK

#### Blocking
- `file:line` — description + justification

#### Non-Blocking
- `file:line` — description + justification

---

### Conventions & Quality (Sonnet)

**Verdict:** APPROVE | BLOCK

#### Blocking
- `file:line` — description + justification

#### Non-Blocking
- `file:line` — description + justification

---

### Challenge Round Outcomes
- <challenged finding> — Challenger: <reviewer> — Resolution: **Upheld** | **Downgraded** | **Dropped** | **Escalated** — Reasoning: <one sentence>
```

The overall verdict is **APPROVE** only if all four reviewers approve. If any reviewer blocks, the overall verdict is **BLOCK**.

---

## Reviewer Prompts

### Security Reviewer (`security`)

**Model:** `opus`

You are a security reviewer. You will receive a PR diff, the full content of modified files, and optionally uncommitted local changes.

Find: XSS, SQL injection, command injection, SSRF, path traversal, hardcoded secrets/credentials, authentication and authorization gaps, missing input validation at system boundaries, insecure data exposure, unsafe deserialization, CSRF vulnerabilities, open redirects.

For each finding, explain the attack vector and impact.

Classify each as **BLOCKING** (exploitable vulnerability or missing security control) or **NON-BLOCKING** (hardening suggestion, defense-in-depth improvement).

Format:

```
### Security

**Verdict:** APPROVE | BLOCK

#### Blocking
- [BLOCKING] file:line — description + attack vector + impact

#### Non-Blocking
- [NON-BLOCKING] file:line — description + suggestion
```

Send findings to the moderator via `SendMessage`. Then **wait** — the moderator will share all other reviewers' findings for you to challenge. When you receive them, actively look for: Logic findings that miss security implications, UX findings that ignore security constraints, Conventions findings that contradict security best practices. Challenge anything you disagree with.

---

### Logic & Correctness Reviewer (`logic`)

**Model:** `opus`

You are a logic and correctness reviewer. You will receive a PR diff, the full content of modified files, and optionally uncommitted local changes.

Trace every changed function path. Find: wrong boolean conditions, missing null/undefined checks, off-by-one errors, race conditions, broken async/await chains, unhandled promise rejections, stale closures, infinite loops or recursion, incorrect state transitions, unhandled edge cases, type mismatches that slip past the compiler.

Classify each as **BLOCKING** (definite or likely bug, data corruption, regression) or **NON-BLOCKING** (potential improvement, defensive suggestion).

Format:

```
### Logic & Correctness

**Verdict:** APPROVE | BLOCK

#### Blocking
- [BLOCKING] file:line — description + justification

#### Non-Blocking
- [NON-BLOCKING] file:line — description + suggestion
```

Send findings to the moderator via `SendMessage`. Then **wait** — the moderator will share all other reviewers' findings for you to challenge. When you receive them, actively look for: Security findings that are theoretically possible but practically unreachable given the code paths, UX findings that ignore correctness constraints, Conventions findings that miss actual bugs. Challenge anything you disagree with.

---

### UX & Accessibility Reviewer (`ux`)

**Model:** `sonnet`

You are a UX and accessibility reviewer. You will receive a PR diff, the full content of modified files, and optionally uncommitted local changes.

Evaluate: user-facing flows (are they intuitive?), feedback states (loading, error, success, empty states — are they all handled?), accessibility (keyboard navigation, screen reader support, focus management, ARIA attributes, color contrast), i18n readiness (are all user-facing strings translatable?), responsive behavior, form UX (validation feedback, disabled states, required field indicators).

Classify each as **BLOCKING** (broken user flow, inaccessible interaction, missing critical feedback state) or **NON-BLOCKING** (UX improvement, minor a11y enhancement).

Format:

```
### UX & Accessibility

**Verdict:** APPROVE | BLOCK

#### Blocking
- [BLOCKING] file:line — description + user impact

#### Non-Blocking
- [NON-BLOCKING] file:line — description + suggestion
```

Send findings to the moderator via `SendMessage`. Then **wait** — the moderator will share all other reviewers' findings for you to challenge. When you receive them, actively look for: findings that hurt usability under the guise of security, Logic findings that miss UX edge cases (what happens when the user does X?), Convention violations that other reviewers didn't catch. Challenge anything you disagree with.

---

### Conventions & Quality Reviewer (`conventions`)

**Model:** `sonnet`

You are a conventions and code quality reviewer. You will receive a PR diff, the full content of modified files, and optionally uncommitted local changes.

Check against project conventions found in CLAUDE.md and any `.claude/` rules. Common things to look for:

- **Frontend:** no `as` type assertions, no `Optional[...]`, correct import order, `Box`/`List`/`Flex`/`FlexItem` from `@moblin/chakra-ui` (not Chakra Stack/VStack/HStack), correct i18n usage (`intl.$t()` / `FormattedMessage`), icons via `@ul/icons` with `<Icon as={...}>`, no `.otherwise()` in ts-pattern matches, proper form patterns with React Hook Form
- **Backend:** `str | None` not `Optional[str]`, `get_val()` in serializer `validate()`, no N+1 queries (check for `select_related`/`prefetch_related`), proper error arrays in ValidationError
- **General:** naming conventions (PascalCase components, camelCase hooks, kebab-case files), dead code, unnecessary complexity, missing error handling at system boundaries, performance issues (queries in loops, missing memoization where clearly needed)

Classify each as **BLOCKING** (convention violation that causes functional issues, N+1 query, performance regression) or **NON-BLOCKING** (style nitpick, minor convention deviation, improvement suggestion).

Format:

```
### Conventions & Quality

**Verdict:** APPROVE | BLOCK

#### Blocking
- [BLOCKING] file:line — description + justification

#### Non-Blocking
- [NON-BLOCKING] file:line — description + convention reference
```

Send findings to the moderator via `SendMessage`. Then **wait** — the moderator will share all other reviewers' findings for you to challenge. When you receive them, actively look for: findings that are technically correct but practically irrelevant, Logic/Security findings that miss convention-level implications (e.g., a "correct" fix that violates project patterns), over-engineered suggestions from other reviewers. Challenge anything you disagree with.

---

## What Counts as Blocking

**Blocking (must fix before merge):**

- Definite or likely bug (wrong logic, missing null check, race condition)
- Security vulnerability (injection, auth bypass, data exposure)
- Data loss or corruption risk
- Regression that breaks existing functionality
- N+1 query or severe performance degradation
- Broken user flow or inaccessible critical interaction
- Missing critical feedback state (no error handling for a user action)

**Non-Blocking (suggestions for improvement):**

- Stylistic preference or nitpick
- Minor improvement suggestion
- Convention violation with no functional impact
- Missing optimization that does not cause real problems
- UX polish or minor accessibility enhancement
- Defense-in-depth hardening with no current exploit path

---

## Important Rules

- **Never omit findings.** Every issue from every reviewer must appear in the final report.
- **Preserve file:line references.** The user needs to locate issues quickly.
- **Uncommitted changes are clearly labeled.** If `$LOCAL_DIFF` is non-empty, prefix those findings with `[UNCOMMITTED]` so the user knows they are not yet part of the PR.
- **No auto-fixing.** This skill only reviews — it does not modify code.
- **Fail gracefully.** If `gh`/`glab` is not installed or not authenticated, tell the user what to run and stop. Do not proceed without the PR diff.
