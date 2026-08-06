---
name: pr-reviewer
description: Review the current branch's GitHub or GitLab PR with a single Opus sub-agent. Proves every claim against the real code and environment instead of guessing, grades findings High/Medium/Minor, blocks on a High or a quietly-failing Medium, and writes in plain language a junior dev can read. Offers to post the findings to the PR as inline comments. Use whenever the user wants a PR or MR reviewed.
---

# PR Reviewer

Review the current branch's PR. Gather the context, prove the facts the review will lean on, hand it all to **one** Opus reviewer, report the findings, then offer to post them.

One reviewer, not five. The report is short on purpose, the author should read it in under a minute.

Two things matter more than coverage: **every claim is proven**, and **every sentence is readable by a junior dev**. A finding you cannot prove is noise. A finding nobody understands does not get fixed.

## Phase 1 — Gather context

Detect the platform from `git remote get-url origin`: `github.com` means GitHub, `gitlab` means GitLab, neither means ask the user.

Get the diff with `gh pr diff "$branch"` or `glab mr diff`, where `branch=$(git rev-parse --abbrev-ref HEAD)`. If there is no open PR or MR, diff against the default branch instead (`gh repo view --json defaultBranchRef -q '.defaultBranchRef.name'`, then `git diff "$default_branch"...HEAD`).

Then collect:

- **Metadata** with `gh pr view "$branch" --json title,body,baseRefName` or `glab mr view`. Note the base branch, it is often another feature branch, not the default one.
- **Uncommitted changes** with `git diff HEAD`. If non-empty, include it, labeled as not yet part of the PR.
- **CLAUDE.md**, the root file plus any in directories the PR touches, read in full. Rule files those point to count too.
- **Modified files**, the full current content of each one, so the reviewer sees more than hunks.

If `gh` or `glab` is missing or not authenticated, tell the user what to run and stop.

## Phase 2 — Prove the facts (do this before the handoff)

The reviewer can only reason about what is in front of it. Anything the review will lean on that is *not* visible in the diff is a fact you go and prove first. Guessing here is where bad reviews come from: a "bug" that the library already handles, a "missing" event that is emitted two files away, a severity argued from vibes.

Write down the claims the review depends on, then resolve each one against the real thing:

- **Third-party behavior.** Read the installed package, not the docs and not memory. Find where it actually lives (a venv, `node_modules`, a running container) and read the source or print the signature. Versions drift, docs lie.
- **Signatures and defaults.** Print them. Every argument the diff passes, does it exist? What is the default when it is left out? Is that value even valid?
- **Does this code path run at all?** Trace it end to end and name each link. "Reachable" without a chain of real call sites is a guess.
- **Tests.** Read what an assertion actually asserts. An assertion on a value the vendor hardcodes tests nothing. Run the touched tests yourself.
- **CI.** Read the checks rather than trusting the description. A red row is sometimes a cancelled superseded run, and a green run sometimes skipped the job that matters.

**Prefer running it to reading it.** If the finding is "this leaks" or "this fires twice", reproduce it in the smallest way you can: a three-line script in the same environment beats a paragraph of reasoning. That is the difference between "I think this repoints the credentials" and "I set the variable, built the object, and it came back with the wrong key".

Keep each proven fact as one line with its evidence next to it: `file:line`, or the command and what it printed. Those lines go into the reviewer prompt as ground truth.

**When a fact is genuinely unknowable**, say so out loud and let the unknown hold the finding *down* a tier. Cloud permissions, production data shape, and anything living in secrets usually cannot be checked from a repo. Never assume the worse case to make a finding bigger. "I could not check X, which is the only reason this is not higher" is a real, honest finding. A guess dressed as a fact is not.

## Phase 3 — Review (one Opus agent)

Spawn **one** `Agent`, model `opus`. Put everything inline: diff, metadata, uncommitted changes, CLAUDE.md contents, the full modified files, and the proven facts from Phase 2. Tell it not to re-fetch anything; it may read extra files only to trace an import or check a signature.

Reviewer prompt:

> You are a senior engineer reviewing this PR. All context is inline: the diff, the modified files, the relevant CLAUDE.md rules, any uncommitted changes, and a list of already-verified facts. Don't run git/gh/glab. Read extra files only to trace an import or a signature.
>
> The verified facts were proven against the real code and the real environment. Treat them as ground truth and don't re-derive them.
>
> **No guessing.** Every claim you make must trace to the inlined code, one of the verified facts, or a check you ran yourself. If you cannot ground it, don't report it. If a finding's severity depends on something you could not verify, say which part is unverified inside the finding, and let that unknown hold the severity down a tier. Never assume the worse case to make a finding bigger.
>
> Look across the whole change: correctness bugs, security holes, missing edge cases, broken async, race conditions, convention violations (CLAUDE.md is the source of truth), UX gaps, and design smells. Was there a simpler or safer way?
>
> Only flag what a senior engineer would actually raise. Skip nitpicks a linter catches. Skip pre-existing issues. Skip anything on lines the author didn't touch.
>
> Rate each finding against these definitions and nothing else:
> - **High**: bug, security hole, data loss, or breaking change. Must fix before merge.
> - **Medium**: a real problem that should be fixed. Usually not a merge blocker, see the blocking test below.
> - **Minor**: a nit or suggestion.
>
> **The scale is absolute, never relative to the rest of the batch.** The worst thing in a PR is not automatically High, and a PR is not owed one finding of each tier. If the worst thing you found is a nit, then this PR has one Minor finding and no Highs. Grade each finding as if it were the only thing you found. Every section is allowed to be empty. Never promote a finding to fill one, and never add a finding you'd otherwise have cut just to avoid a short report.
>
> **Demotion gate, run it on every finding before you report it.** Write the strongest argument that the finding belongs one tier lower. Then try to defeat that argument with a concrete failure scenario: a real caller, a real input, and the real damage it does. If you cannot produce that scenario, the demotion argument wins, drop the finding one tier. Demoted below Minor means it isn't a finding at all, cut it.
>
> Run the gate to find out the answer, not to justify a tier you already picked. Manufacturing a rebuttal you don't believe is the exact failure this gate exists to prevent. Demotion arguments that usually win: only a trusted operator can trigger it and the damage is self-inflicted; it's theoretical and nothing real reaches the code path; your own proposed fix doesn't address the problem you described.
>
> **The gate cuts both ways. It is not a licence to talk yourself out of a real bug.** Anything an untrusted caller can exploit, anything that corrupts or loses data, and anything that silently returns a wrong result on a realistic input is High, the gate never lowers those. Demotion arguments that never win: the bad input is "unlikely" or some earlier layer "probably" validates it; the fix is awkward or feels out of scope (severity describes the problem, not the cost of fixing it); you're unsure how often it fires (frequency isn't severity).
>
> For every High, keep the scenario that defeated the demotion, one concrete line. It goes in the report. If you can't write that line, it isn't a High.
>
> **Does a Medium block?** Default is no. A Medium blocks only when all three of these hold:
> 1. **It will happen.** Normal use reaches it once this merges. Not a path someone could theoretically reach.
> 2. **Nobody finds out fast.** It fails quietly: a swallowed error, a log line no one reads, a result that looks fine but isn't. Anything that fails loudly (a crash, a red test, obvious breakage) does not block, because it gets fixed the day it happens.
> 3. **The fix is small and lives in this diff.** If fixing it is separate work, it does not block, it becomes a follow-up.
>
> A blocking Medium carries the same `Why it blocks` line as a High. If you cannot write all three parts, it does not block. Severity still ignores fix cost, but *blocking* is a merge decision, and fix cost belongs in a merge decision. Blocking is the exception: if you block on most PRs you are reading this test too loosely.
>
> **Write every finding for a junior developer or a non-technical reader.** Rules:
> - Order: what breaks, who notices, what to change.
> - Everyday words. When you must name a file, function, or setting, add a few plain words on what it does.
> - Two to four short sentences. One idea per sentence.
> - No em dashes. Use commas, brackets, or a new sentence.
> - No insider vocabulary. Banned unless you immediately explain it in plain words: coupling, leaky abstraction, surface area, graceful degradation, non-deterministic, idempotent, footgun, code smell, contract. Say the thing that actually happens instead.
>
> Too complicated: "the process-wide env override leaks into an unrelated consumer, so KB retrieval silently degrades."
> Right: "This puts the AWS key into the shared process settings, where anything else in the same job can read it. The search ranker does exactly that, so during a call it would use the wrong key. If that key is not allowed to rank, the error is swallowed and the caller just gets a worse answer."
>
> For each finding give: `file:line`, the problem, and one concrete fix, what to actually change, not "consider refactoring".
>
> For a Minor, also say which kind it is. Either it is a **quick fix**, in which case give the fix, a rename or a moved line or one extra assertion, or it is a **note**, something the author should know with nothing cheap to act on. Cheap Minors are worth raising, they cost less to fix than to read about. Say which, so the author can act on the quick ones and skim the rest.
>
> Also return a one-line summary of what the PR does. If the PR is clean, say so and return no findings.

## Phase 4 — Check the proof, then report

Before writing anything, walk each returned finding and ask: **what proves this?** Point at the diff line, a verified fact, or a check that was run. If the answer is "it looks like" or "presumably", cut the finding or drop it a tier and label the unverified part. Do this even when the finding sounds right, especially then. Sub-agents produce confident prose about code that does not behave that way.

Then pick the verdict:

- **🔴 Blocked**: at least one High, or at least one Medium that passes the three-part blocking test.
- **🟢 Approved**: nothing blocking. The remaining Medium and Minor findings are advice.

Render it short. Drop any empty severity section. Keep `file:line` on every finding. Order High, Medium, Minor, and put a blocking Medium at the top of its section.

```markdown
## PR Review: <title>

**🔴 Blocked**: <one line, the blocker>   ← use 🟢 Approved when nothing blocks

<one-line summary of what the PR does>

<one or two lines on what you proved, so the author knows this was checked and not guessed>

### 🔴 High
- `file:line`: problem, in plain words. **Fix:** concrete change.
  **Why it blocks:** real caller, real input, real damage.

### 🟡 Medium
- `file:line`: problem, in plain words. **Fix:** concrete change.
  **Why it blocks:** (blocking Mediums only) it will happen, it fails quietly, the fix is small and local.

### ⚪ Minor
- `file:line`: problem, in plain words. **Fix:** concrete change. (quick fixes)
- `file:line`: problem, in plain words. (notes, nothing cheap to act on)
```

If nothing was found:

```markdown
## PR Review: <title>

**🟢 Approved**: no issues found.

<one-line summary of what the PR does>

<one or two lines on what you proved>
```

## Phase 5 — Offer to post it

Only when there is at least one finding. On a clean review, say it is clean and stop, do not ask.

Ask with `AskUserQuestion`. Two questions in one call, so it is a single round trip.

**How to post:**

- **Post as a pending review (recommended)**: comments land on the PR but stay invisible to others until the user submits.
- **Post and submit**: same comments, submitted straight away. Ask which event: approve, request changes, or comment.
- **Don't post**: the report in the chat is enough.

**What to post:**

- **Only what's worth fixing (recommended)**: everything with a concrete fix the author can apply in a few minutes. That is every High and Medium, plus any Minor that is a quick fix. A cheap Minor is worth posting, a one-line rename is less work than reading about it. What drops out is the pure notes: observations with nothing to act on, or where the fix costs more than the problem.
- **Everything**: every finding, including the notes, one thread each.

Skip the second question when the two options would produce the same threads, for example when there are no Minor findings or all of them are quick fixes. Skip it too if the user already said which they want.

If they want it posted, use the **`pr-comment-inline` skill** for the mechanics. Do not hand-roll the GraphQL, that skill already knows the node IDs, which lines GitHub accepts, and what to do when a file is not in the diff. Its comment rules apply as written, plus:

- Lead each comment with its severity in bold: `**Medium.** ...`
- The review body is one or two sentences. It does not repeat the threads.
- A finding whose file or line is not in the PR diff goes in the body, with its `file:line` in the text.

Never submit an approval or a request for changes that the user did not ask for.

## Rules

- **One sub-agent.** A single Opus reviewer, nothing else.
- **Prove it or drop it.** No claim reaches the report without the diff, a verified fact, or a check that was run behind it. Say which parts you could not verify.
- **Plain language, short.** Written for a junior dev. No em dashes. One line per finding where possible, no diff dumps, no filler.
- **Every finding has a `file:line`.** Every High and Medium has a concrete fix.
- **Blocked needs a High, or a Medium that passes the three-part test.** Both carry a `Why it blocks` line.
- **Review only.** Never edit code. Never post or submit anything without asking first.
- **Label uncommitted findings** with `[uncommitted]` so the author knows they aren't part of the PR yet.
