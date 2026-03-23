---
name: pr-review-analyzer
description: Analyze PR review comments with two agents debating devil's-advocate style per comment, then produce casual copy-pasteable replies rated FIX or SKIP.
---

# PR Review Comment Analyzer

Fetch review comments from a GitHub PR or GitLab MR. For each comment, two agents argue devil's-advocate style — one defends the comment, one attacks it. The moderator renders a verdict and drafts a casual reply the user can copy-paste.

---

## Phase 1: Gather Context

### Step 1 — Detect platform

```bash
git remote get-url origin
```

- Contains `github.com` → **GitHub**
- Contains `gitlab` → **GitLab**
- Otherwise → ask the user via `AskUserQuestion`

### Step 2 — Fetch PR/MR number

**GitHub:**

```bash
gh pr view --json number -q .number
```

**GitLab:**

```bash
glab mr view --output json | jq '.iid'
```

If no open PR/MR is found for the current branch, ask the user for the PR/MR number or URL.

Store as `$PR_NUMBER`.

### Step 3 — Fetch review comments

**GitHub:**

```bash
# Get repo owner/name
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# Fetch review comments (inline code comments)
gh api repos/$repo/pulls/$PR_NUMBER/comments

# Also fetch issue-level comments (general PR comments)
gh api repos/$repo/issues/$PR_NUMBER/comments
```

**GitLab:**

```bash
# Fetch MR discussions (threads with inline comments)
glab api projects/:id/merge_requests/$PR_NUMBER/discussions

# Fetch MR notes (general comments)
glab api projects/:id/merge_requests/$PR_NUMBER/notes
```

Store the combined comments as `$COMMENTS`. For each comment, extract:

- `id` — unique identifier
- `author` — who wrote it
- `body` — the comment text
- `path` — file path (if inline comment)
- `line` — line number (if inline comment)
- `url` — direct link to the comment

Filter out: bot comments, your own comments (match against `gh api user` / `glab auth status`), and already-resolved threads.

### Step 4 — Fetch PR diff and modified files

**GitHub:**

```bash
gh pr diff $PR_NUMBER
```

**GitLab:**

```bash
glab mr diff
```

Store as `$PR_DIFF`. Read the full content of files referenced by comments so agents have context beyond just the diff hunks.

### Step 5 — Count and present

Tell the user how many comments were found and from which reviewers. If zero comments, stop.

---

## Phase 2: Triage

Create the team:

```
TeamCreate: team_name="pr-comment-analysis", description="Analyzing review comments for PR #<number>"
```

Spawn a single **triage agent**:

```
Agent tool:
  subagent_type: "general-purpose"
  team_name: "pr-comment-analysis"
  name: "triage"
  model: "opus"
```

Pass the triage agent:

- All `$COMMENTS` with their id, body, path, line, and url
- The `$PR_DIFF`
- The full content of referenced files

Instructions for the triage agent:

> Classify each comment into one of three buckets:
>
> - `OBVIOUS_FIX` — clearly correct: real bug, security issue, broken logic, missing error handling. No debate needed.
> - `OBVIOUS_SKIP` — clearly not worth acting on: pure style nit, subjective naming preference, "have you considered..." with no concrete issue, praise/acknowledgment. No debate needed.
> - `AMBIGUOUS` — reasonable people could disagree. Needs debate.
>
> For each comment, return: `{id, bucket, one_sentence_reason}`.
>
> Send your classifications to the moderator via `SendMessage`.

Wait for the triage agent's response. Shut it down:

```
SendMessage type="shutdown_request" to "triage"
```

`OBVIOUS_FIX` and `OBVIOUS_SKIP` comments get their verdict immediately — no debate. Only `AMBIGUOUS` comments proceed to Phase 3.

---

## Phase 3: Devil's Advocate Debates

For all `AMBIGUOUS` comment, spawn a debate pair **within the same team**.
The two agents debate all `AMBIGUOUS` comments, but one after the other.

For comment at index `N`, spawn two agents simultaneously:

```
Agent tool:
  subagent_type: "general-purpose"
  team_name: "pr-comment-analysis"
  name: "advocate-N"
  model: "opus"

Agent tool:
  subagent_type: "general-purpose"
  team_name: "pr-comment-analysis"
  name: "challenger-N"
  model: "sonnet"
```

### Advocate instructions (per comment):

> You are the **Advocate** in a devil's-advocate debate about a PR review comment. Your job is to argue that this comment is **valid and must be fixed**.
>
> **The review comment:**
> {comment body}
> **File:** {path}:{line}
> **Link:** {url}
>
> **The relevant code:**
> {file content around the commented line}
>
> **The diff:**
> {relevant diff hunk}
>
> Rules:
>
> - Argue in 2-4 sentences. Be specific — cite the code.
> - Steelman the reviewer's point. Find the strongest possible reason this matters.
> - Send your argument to `challenger-N` via `SendMessage`.
> - After receiving the challenger's rebuttal via `SendMessage`, you get one final response: either **double down** (with new evidence) or **concede** (if the rebuttal is genuinely strong). Be honest — don't defend a losing position just to win.
> - Send the full exchange (your argument, their rebuttal, your final response) to the moderator via `SendMessage`.

### Challenger instructions (per comment):

> You are the **Challenger** in a devil's-advocate debate about a PR review comment. Your job is to argue that this comment is **wrong, nitpicky, or not worth acting on**.
>
> **The review comment:**
> {comment body}
> **File:** {path}:{line}
> **Link:** {url}
>
> **The relevant code:**
> {file content around the commented line}
>
> **The diff:**
> {relevant diff hunk}
>
> Rules:
>
> - Wait for the advocate's `SendMessage` with their argument.
> - Rebut in 2-4 sentences. Be specific — cite the code, explain why the concern doesn't apply, or why it's too minor to matter.
> - Find the strongest possible reason this comment should be ignored. Consider: is this actually a bug or just style? Does the existing code already handle this? Is the reviewer applying a rule that doesn't fit here?
> - Send your rebuttal to `advocate-N` via `SendMessage`.
> - After receiving the advocate's final response via `SendMessage`, send your own final take (1-2 sentences: did they change your mind, or do you stand firm?) to the moderator via `SendMessage`.

### Collect and judge

As each advocate sends the full exchange transcript, render a verdict:

- **FIX** — the advocate's argument held up. The comment is valid.
- **SKIP** — the challenger won. The comment is not worth acting on.

Judge based on the strength of arguments, not on who spoke last. If genuinely 50/50, default to **FIX** — better to address a valid concern than to ignore it.

After all debates complete, shut down all debate agents:

```
SendMessage type="shutdown_request" to each advocate-N and challenger-N
```

---

## Phase 4: Draft Replies

For every comment (triaged and debated), draft a casual reply. The tone should be:

- **Conversational** — like a colleague on Slack, not a formal letter
- **Brief** — 1-3 sentences max
- **Non-confrontational** — even for SKIP verdicts, be respectful

### FIX replies:

Acknowledge the point and say what you'll do. Examples:

- "Good catch, fixing this now."
- "Yeah you're right, the null check is missing here. Pushing a fix."
- "Ah I see it now — updated to use `select_related` to avoid the N+1."

### SKIP replies:

Politely explain why you're not acting on it. Don't be dismissive — give a reason. Examples:

- "I considered this but the upstream handler already validates the input before it reaches this point, so the extra check would be redundant."
- "Fair point in general, but here the variable is only used in the next 3 lines so I think the short name is fine. Happy to rename if you feel strongly though."
- "This is intentional — we need the eager load here because the child component accesses it synchronously. Added a comment to clarify."

---

## Phase 5: Cleanup & Report

Call `TeamDelete` to clean up the team.

Present all results in this format. **Do not omit any comment.**

```markdown
## PR Comment Analysis

**PR:** #<number> — <title>
**Platform:** GitHub | GitLab
**Comments analyzed:** <total>
**Verdicts:** <fix_count> FIX, <skip_count> SKIP

---

### Comment 1: FIX

**Reviewer:** @username
**File:** `path/to/file.ts:42`
**Comment:** "This function doesn't handle null values properly"
**Link:** <url>
**How it was decided:** Triaged as OBVIOUS_FIX — clear null dereference on line 42.

> **Reply:**
> Good catch, fixing this now.

---

### Comment 2: SKIP

**Reviewer:** @username
**File:** `path/to/file.ts:15`
**Comment:** "Maybe rename this variable to something more descriptive?"
**Link:** <url>
**How it was decided:** Triaged as OBVIOUS_SKIP — subjective naming preference.

> **Reply:**
> The name is only used locally in the next few lines, I think it reads fine as-is. Happy to rename if you feel strongly.

---

### Comment 3: FIX (debated)

**Reviewer:** @username
**File:** `path/to/api.py:88`
**Comment:** "This query inside the loop will cause N+1"
**Link:** <url>
**How it was decided:** Advocate argued the queryset hits the DB per iteration since there's no prefetch. Challenger argued Django's queryset caching handles it. Advocate doubled down — caching only works on the same queryset instance, not across loop iterations. **Advocate wins.**

> **Reply:**
> Yeah you're right, the prefetch is missing here. Fixed with `prefetch_related`.

---

### Comment 4: SKIP (debated)

**Reviewer:** @username
**File:** `path/to/component.tsx:23`
**Comment:** "Should use useCallback here to prevent re-renders"
**Link:** <url>
**How it was decided:** Advocate argued child components would re-render on every parent render. Challenger argued the child is not memoized so useCallback achieves nothing — the re-render happens regardless. **Challenger wins.**

> **Reply:**
> The child component isn't wrapped in `memo`, so `useCallback` wouldn't prevent re-renders here. If we memoize the child later we can revisit.
```

---

## Phase 6: Act on FIX items

After presenting the report, ask the user:

> "Want me to fix the FIX items? I'll go through them one by one."

If yes, for each FIX comment:

1. Show the comment and the proposed fix
2. Ask "Should I fix this one?"
3. Only implement after explicit approval
4. Move to the next comment

---

## Important Rules

- **Never omit a comment.** Every comment gets a verdict and a reply draft.
- **Preserve links.** The user needs to click through to respond.
- **Filter out noise.** Skip bot comments, your own comments, and resolved threads before analysis.
- **Fail gracefully.** If `gh`/`glab` is not installed or not authenticated, tell the user what to run and stop.
- **Casual tone only.** The replies are meant to sound human. No formal language, no "I appreciate your feedback", no corporate speak.
- **Honest verdicts.** Don't default to FIX to be safe on triaged items — only on genuinely ambiguous debates. The triage step exists precisely to avoid unnecessary caution on obvious skips.
