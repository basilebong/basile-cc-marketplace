---
name: pr-reviewer
description: Review the current branch's GitHub or GitLab PR with a single Opus sub-agent. Groups findings into High, Medium, and Minor, then gives a clear Blocked or Approved verdict. Short, scannable output. Use whenever the user wants a PR or MR reviewed.
---

# PR Reviewer

Review the current branch's PR. Gather the context, hand it to **one** Opus reviewer, then report the findings by severity with a clear verdict.

One reviewer, not five. The report is short on purpose — the author should read it in under a minute.

## Phase 1 — Gather context

Detect the platform from the remote:

```bash
git remote get-url origin
```

- Contains `github.com` → **GitHub**
- Contains `gitlab` → **GitLab**
- Neither → ask the user.

Get the diff. **GitHub:**

```bash
branch=$(git rev-parse --abbrev-ref HEAD)
gh pr diff "$branch"
```

**GitLab:**

```bash
glab mr diff
```

If that fails (no open PR/MR), diff against the default branch instead:

```bash
# GitHub
default_branch=$(gh repo view --json defaultBranchRef -q '.defaultBranchRef.name')
# GitLab
default_branch=$(git remote show origin | grep 'HEAD branch' | awk '{print $NF}')

git diff "$default_branch"...HEAD
```

Then collect:

- **Metadata** — `gh pr view "$branch" --json title,body` or `glab mr view`. Title and description.
- **Uncommitted changes** — `git diff HEAD`. If non-empty, include it, labeled as not yet part of the PR.
- **CLAUDE.md** — the root file plus any in directories the PR touches. Read them in full.
- **Modified files** — read the full current content of each changed file, so the reviewer sees more than hunks.

If `gh` / `glab` is missing or not authenticated, tell the user what to run and stop.

## Phase 2 — Review (one Opus agent)

Spawn **one** `Agent`, model `opus`. Put all the context inline in its prompt — diff, metadata, uncommitted changes, CLAUDE.md contents, and the full modified files. Tell it not to re-fetch anything; it may read extra files only to trace an import or check a signature.

Reviewer prompt:

> You are a senior engineer reviewing this PR. All context is inline: the diff, the modified files, the relevant CLAUDE.md rules, and any uncommitted changes. Don't run git/gh/glab. Read extra files only to trace an import or a signature.
>
> Look across the whole change: correctness bugs, security holes, missing edge cases, broken async, race conditions, convention violations (CLAUDE.md is the source of truth), UX gaps, and design smells — was there a simpler or safer way?
>
> Only flag what a senior engineer would actually raise. Skip nitpicks a linter catches. Skip pre-existing issues. Skip anything on lines the author didn't touch.
>
> Rate each finding against these definitions and nothing else:
> - **High** — bug, security hole, data loss, or breaking change. Must fix before merge.
> - **Medium** — a real problem that should be fixed, but not a merge blocker.
> - **Minor** — a nit or suggestion.
>
> **The scale is absolute, never relative to the rest of the batch.** The worst thing in a PR is not automatically High, and a PR is not owed one finding of each tier. If the worst thing you found is a nit, then this PR has one Minor finding and no Highs. Grade each finding as if it were the only thing you found — never rank them against each other and hand the top slot a High. Every section is allowed to be empty. Never promote a finding to fill one, and never add a finding you'd otherwise have cut just to avoid a short report.
>
> **Demotion gate — run it on every finding before you report it.** Write the strongest argument that the finding belongs one tier lower. Then try to defeat that argument with a concrete failure scenario: a real caller, a real input, and the real damage it does. If you cannot produce that scenario, the demotion argument wins — drop the finding one tier. Demoted below Minor means it isn't a finding at all; cut it.
>
> Run the gate to find out the answer, not to justify a tier you already picked. Manufacturing a rebuttal you don't believe is the exact failure this gate exists to prevent. Demotion arguments that usually win:
> - Only a trusted operator or admin can trigger it, and the damage is self-inflicted.
> - It's theoretical, or defense-in-depth — nothing real reaches the code path.
> - Your own proposed fix doesn't address the problem you described (a parse-time check is no fix for memory already allocated upstream).
>
> **The gate cuts both ways. It is not a licence to talk yourself out of a real bug.** When the failure scenario is there, you write it down and the finding stands. Anything an untrusted caller can exploit, anything that corrupts or loses data, and anything that silently returns a wrong result on a realistic input is High — the gate never lowers those. These demotion arguments never win:
> - The bad input is "unlikely", the caller "shouldn't" do that, or some earlier layer "probably" validates it. If untrusted input can reach it, it happens.
> - The fix is awkward, large, or feels out of scope. Severity describes the problem, not the cost of fixing it.
> - You're unsure how often it fires. Frequency isn't severity — an auth bypass that fires once is still an auth bypass.
>
> For every High, keep the scenario that defeated the demotion — one concrete line. It goes in the report. **If you can't write that line, it isn't a High.**
>
> For each finding give: `file:line`, one sentence on the problem, and one concrete fix — what to actually change, not "consider refactoring". The fix is optional for Minor.
>
> Also return a one-line summary of what the PR does. If the PR is clean, say so and return no findings.

## Phase 3 — Report

Pick the verdict:

- **🔴 Blocked** — at least one High finding.
- **🟢 Approved** — no High findings. (Medium and Minor are advice, not blockers.)

Render it short. Drop any empty severity section. Keep `file:line` on every finding. Order findings High → Medium → Minor. Every High carries its `Why it blocks:` line — that line is the reviewer showing the failure scenario that kept the finding out of Medium.

```markdown
## PR Review: <title>

**🔴 Blocked** — <one line: the blocker>   ← use 🟢 Approved when there are no High findings

<one-line summary of what the PR does>

### 🔴 High
- `file:line` — problem. **Fix:** concrete change.
  **Why it blocks:** real caller, real input, real damage.

### 🟡 Medium
- `file:line` — problem. **Fix:** concrete change.

### ⚪ Minor
- `file:line` — problem.
```

If nothing was found:

```markdown
## PR Review: <title>

**🟢 Approved** — no issues found.

<one-line summary of what the PR does>
```

## Rules

- **One sub-agent.** A single Opus reviewer — nothing else.
- **Keep it short.** Plain words, one line per finding. No diff dumps, no filler.
- **Every finding has a `file:line`.** Every High and Medium has a concrete fix.
- **Blocked needs a High finding.** Nothing else blocks the merge.
- **No scenario, no High.** Every High carries a `Why it blocks:` line — real caller, real input, real damage. A High that can't name one gets demoted before it reaches the report.
- **Grade absolutely, never relative.** The worst finding in a PR is not automatically High. "No issues found" is a real, good result — report it instead of promoting something to fill the section. Relay the reviewer's grades as-is; on a genuine judgment call between two tiers, the lower one wins.
- **Never round a real bug down.** Exploitable by an untrusted caller, data loss, or a silently wrong result on realistic input is High, full stop. An awkward fix or an uncertain trigger frequency doesn't demote it. Deflating a bug to look agreeable is the same failure as inflating a nit to look thorough.
- **Review only.** Never edit code.
- **Label uncommitted findings** with `[uncommitted]` so the author knows they aren't part of the PR yet.
