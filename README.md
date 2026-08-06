# Claude Code Marketplace

A collection of Claude Code skills for software development workflows. All skills are bundled into a single `basilebong` plugin and invoked via the `basilebong:` namespace.

## Skills

### pm-spec
Acts as a Product Manager — explores the codebase, gathers requirements via interactive discovery, and produces a concise feature spec with lean user stories, edge cases, and file references. Runs a panel of reviewer sub-agents (UX, Security, Architecture, Business) before finalizing.

**Usage:** `/basilebong:pm-spec` or describe a feature you want to spec out.

### pr-reviewer
Reviews the current branch's GitHub or GitLab PR using a single Opus sub-agent. Groups findings into High, Medium, and Minor, and closes with a clear Blocked or Approved verdict. Output is short and scannable, readable in under a minute.

**Proof, not guesses.** The facts a finding rests on get checked against the real thing: the installed package rather than the docs, the actual signature, the real call chain, what an assertion truly asserts. If a claim can be reproduced, it is. Every High and Medium carries a one-line `Proven:` or `Unverified:` receipt, and an unverified claim drops the finding a tier and says so rather than being deleted or assumed the worse way.

**Severity is absolute**, graded per finding rather than ranked within the PR, so nothing gets promoted just to fill a section. Every finding runs a demotion gate first, and every High names the concrete failure scenario that blocks the merge. The gate cuts both ways: an exploitable path, data loss, or a silently wrong result stays High no matter how awkward the fix is.

**A Medium can block too**, through one of two doors. Either the damage done before a follow-up lands cannot be undone (a secret needing rotation, data written wrong, something published externally), or it fails so silently that the follow-up never gets written at all. Both need the same real-caller scenario a High needs. Severity and blocking stay separate properties, so inflating a tier buys nothing, and fix cost is not a door.

**Written for a junior dev.** What breaks, who notices, what to change, in everyday words. No insider vocabulary.

Finishes by asking whether to post the findings on the PR, pending or submitted, and whether to post everything or only what is worth fixing (a cheap Minor counts). The posting itself is handed to the `pr-comment-inline` skill.

**Usage:** `/basilebong:pr-reviewer` (reviews the current branch's PR/MR).

## Installation

Add this repository as a Claude Code plugin source:

```
claude plugin add /path/to/basile-cc-marketplace
```

## Author

Basile Bong
