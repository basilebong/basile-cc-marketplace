# Claude Code Marketplace

A collection of Claude Code skills for software development workflows.

## Skills

### pm-spec
Acts as a Product Manager — explores the codebase, gathers requirements via interactive discovery, and produces a concise feature spec with lean user stories, edge cases, and file references. Runs a panel of reviewer sub-agents (UX, Security, Architecture, Business) before finalizing.

**Usage:** `/pm-spec` or describe a feature you want to spec out.

### pr-reviewer
Spawns specialized sub-agents (Security, Logic, UX, Conventions) to review a PR from GitHub or GitLab. Each issue is scored on a 0-100 confidence scale, filtering to high-confidence findings only.

**Usage:** `/pr-reviewer` with a PR URL or number.

### pr-comment-analyzer
Analyzes PR review comments with two agents debating devil's-advocate style, then produces casual copy-pasteable replies rated FIX or SKIP.

**Usage:** `/pr-comment-analyzer` with a PR URL or number.

## Installation

Add this repository as a Claude Code plugin source:

```
claude plugin add /path/to/basile-cc-marketplace
```

## Author

Basile Bong
