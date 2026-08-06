---
name: pr-reviewer
description: Review the current branch's GitHub or GitLab PR with a single Opus sub-agent. Proves its claims against the real code and environment instead of guessing and labels what it could not verify, grades findings High/Medium/Minor, blocks on a High or on a Medium whose damage cannot be undone or would never be noticed, and writes in plain language a junior dev can read. Offers to post the findings to the PR as inline comments. Use whenever the user wants a PR or MR reviewed.
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
- **How to reach the running code**, if it lives in a container or a venv. The exact `docker exec` or interpreter path goes in the prompt, otherwise the reviewer cannot check anything for itself.

If `gh` or `glab` is missing or not authenticated, tell the user what to run and stop.

**Mind the context budget.** "Full files inline" stops being possible on a large PR, and silent truncation wrecks the review with no warning. If the changed files are too big to inline whole, send the full content of the files carrying real logic and fall back to hunks plus generous surrounding context for the rest. Say in the report which files went in trimmed, so nobody reads the review as more thorough than it was.

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

> You are a senior engineer reviewing this PR. All context is inline: the diff, the modified files, the relevant CLAUDE.md rules, any uncommitted changes, and a list of already-verified facts. Don't re-fetch the PR (no git/gh/glab). You may read any file, including installed dependency source (a venv, `site-packages`, `node_modules`, a running container), and run read-only commands to check a claim.
>
> The verified facts were proven against the real code and the real environment. Treat them as ground truth and don't re-derive them.
>
> **Verify what your findings rest on.** When a High or Medium depends on how a library, the runtime, or another component behaves, go and check it: read the installed source, confirm the argument or flag really exists, reproduce it when a read-only command can. Scope this to claims your High and Medium findings actually hang on, not to everything you noticed.
>
> Every High and Medium ends with one evidence line:
> - `Proven:` what you checked and where.
> - `Unverified:` what you could not check.
>
> **"Unverified" is a legal, expected outcome.** Report the finding anyway and label it. An unverified load-bearing claim drops the finding one tier and says so. Never delete a real concern because you could not prove it, and never state a guess as fact. Never assume the worse case to make a finding bigger. Minor findings need no evidence line.
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
> **Does a Medium block?** Severity and blocking are separate properties. Grading stays absolute, so there is nothing to gain by inflating a tier. Default is no: a Medium is advice.
>
> Assume the PR merges now and the fix lands in a normal follow-up. A Medium blocks only through one of two doors:
>
> **Door 1, the damage cannot be undone.** Something in that window is permanent: a secret that then needs rotating, data written wrong, anything sent or published outside the system. If the follow-up fully undoes it, this door is shut. Slower code, noisy logs, and self-inflicted operator mistakes are reversible and never block.
>
> **Door 2, nobody will ever find out.** It happens in normal use and it fails silently: a swallowed error, a log line no one reads, a result that looks right and isn't. The follow-up never gets written because nothing tells anyone it is needed. A loud failure (a crash, a red test, obvious breakage) shuts this door, that gets fixed the day it happens.
>
> Either door needs the same standard as a High: real caller, real input, real damage, written as one line next to the finding. No line, no block. The finding stays Medium either way. Note that fix cost is not a door, severity and blocking both ignore it.
>
> Blocking is the exception. If you block on most PRs you are reading these doors too loosely. Watch your own "logs are forever" style permanence claims, the real-caller bar kills those.
>
> **Write every finding for a junior developer or a non-technical reader.** Rules:
> - Order: what breaks, who notices, what to change.
> - Everyday words. When you must name a file, function, or setting, add a few plain words on what it does.
> - Two to four short sentences. One idea per sentence.
> - No em dashes. Use commas, brackets, or a new sentence.
> - **Mechanism words are fine, evaluative jargon is not.** Race condition, SQL injection, deadlock, off-by-one each name a precise thing a junior can look up, keep them. Coupling, leaky abstraction, surface area, graceful degradation, footgun, code smell, "leaks into" are verdicts dressed up as nouns, drop them and say what actually happens. Precision lives in the `file:line` and the fix, which stay technical.
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

Walk each returned finding and read its evidence line. A High or a blocking Medium with no `Proven:` line does not render at that tier, demote it or go and prove it yourself. Then re-check, with your own hands, the single claim the verdict hangs on. That one spot-check is cheap and it is the only defense against a confident `Proven:` line that was never actually run. Sub-agents write fluent prose about code that does not behave that way, and the more certain the sentence sounds the more it is worth checking.

Keep the `Unverified:` findings. Report them at their demoted tier with the unverified part named. A concern you could not prove is still worth the author's attention, it just is not worth a blocking verdict.

Then pick the verdict:

- **🔴 Blocked**: at least one High, or at least one Medium that got through one of the two blocking doors.
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
  *Proven:* what was checked and where.

### 🟡 Medium
- `file:line`: problem, in plain words. **Fix:** concrete change.
  **Why it blocks:** blocking Mediums only, which door and the real damage.
  *Proven:* what was checked. Or *Unverified:* what could not be checked, and that this held the tier down.

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

First check who owns the PR: `gh pr view --json author` against `gh api user -q .login`. **GitHub refuses an approval or a request for changes on your own PR**, so when the viewer is the author, pending is the only real option and the question is simply post or don't.

**How to post:**

- **Post as a pending review (recommended)**: comments land on the PR but stay invisible to others until the user submits. They pick the event themselves, which keeps the approve decision with the human.
- **Post and submit**: same comments, submitted straight away. Ask which event: approve, request changes, or comment. Offer this only on someone else's PR.
- **Don't post**: the report in the chat is enough.

**What to post:**

- **Only what's worth fixing (recommended)**: everything with a concrete fix the author can apply in a few minutes. That is every High and Medium, plus any Minor that is a quick fix. A cheap Minor is worth posting, a one-line rename is less work than reading about it. What drops out is the pure notes: observations with nothing to act on, or where the fix costs more than the problem.
- **Everything**: every finding, including the notes, one thread each.

Skip the second question when the two options would produce the same threads, for example when there are no Minor findings or all of them are quick fixes. Skip it too if the user already said which they want.

If they want it posted, use the **`pr-comment-inline` skill** for the mechanics. Do not hand-roll the GraphQL, that skill already knows the node IDs, which lines GitHub accepts, and what to do when a file is not in the diff. Its comment rules apply as written, plus:

- Lead each comment with its severity in bold: `**Medium.** ...` The tiers and the `Why it blocks` lines have to survive into the comment bodies, they are the whole point of the grading.
- The review body is one or two sentences. It does not repeat the threads.
- A finding whose file or line is not in the PR diff goes in the body, with its `file:line` in the text.

Never submit an approval or a request for changes that the user did not ask for.

## Rules

These are for you, the orchestrator. The reviewer's own rules live in its prompt and are not repeated here, one copy only so the two cannot drift apart.

- **One sub-agent.** A single Opus reviewer, nothing else.
- **Spot-check the verdict.** Re-run the one claim the verdict hangs on yourself before you render it.
- **Keep it short.** No diff dumps, no filler, no em dashes anywhere in the report.
- **Say what you trimmed.** Context that did not fit, and findings you cut, get a mention.
- **Review only.** Never edit code. Never post or submit anything the user did not ask for.
- **Label uncommitted findings** with `[uncommitted]` so the author knows they aren't part of the PR yet.
