---
name: pr-comment-inline
description: Post a PR review on GitHub with inline comments via the GraphQL API, with the option to APPROVE, REQUEST_CHANGES, or COMMENT. Use whenever the user wants to leave review feedback on a PR with line-anchored comments (e.g. "comment on this PR", "approve with inline notes", "leave inline review comments", "drop these findings on PR #123"). Handles the gotchas: getting the right node IDs, picking lines that GitHub will accept, and falling back to the body when a file is not in the diff.
---

# PR review with inline comments (GraphQL)

This skill posts a PR review with inline comments using the GitHub GraphQL API. When no pending review exists, it is one mutation. When one already exists, it appends new threads to it and submits.

## When to use

- The user asks to comment on a PR with inline notes.
- The user asks to approve, request changes, or just leave a review with line-anchored comments.
- The user pastes a list of findings and wants them landed on a PR.

If the user only wants a plain top-level comment (no line anchors), use `gh pr comment` instead.

## Tone for the comments

**Write for a junior developer or a non-technical reader.** Someone who has never seen this codebase should understand what breaks and why. That is the bar, every time, unless the user says otherwise.

- Short. Two to four sentences per comment. One idea per sentence.
- Simple, casual, direct, polite.
- Order: what breaks, who notices, what to change.
- Everyday words. When you must name a file, function, or setting, add a few plain words on what it does.
- No em dashes. Use commas, brackets, or just start a new sentence.
- No insider vocabulary. Banned unless you explain it in plain words right there: coupling, leaky abstraction, surface area, graceful degradation, non-deterministic, idempotent, footgun, code smell, contract. Say what actually happens instead.
- Avoid "I think", "maybe", "could you possibly". Say what you saw and what you would do.
- When findings are graded, lead with the severity in bold: `**Medium.** ...`
- Say what proves it, in a few words, when you checked something. "I reproduced it in the container" earns more trust than any amount of explaining.

Examples of the right tone:

> `IconFilter` is a funnel, not a cogwheel. The button is labeled `Open action settings`, so a settings icon would match better. Probably want `IconSettings`.

> Heads up: this `defaultMessage` got renamed in the last commit but the locale files were not regenerated. Worth running the extractor before merging.

> **Medium.** This puts the AWS key into the shared process settings, where anything else in the same job can read it. The search ranker does exactly that, so during a call it would use the wrong key. I reproduced it in the container. Better to pass the key straight to the client instead of leaving it in the shared settings.

Too complicated, do not write this:

> The process-wide env override leaks into an unrelated consumer, so KB retrieval silently degrades to an un-reranked path.

## The review body

One or two sentences. It says the verdict and nothing else. Never repeat what the inline threads already say, the author reads both.

Findings whose file or line is not in the PR diff are the exception, those go in the body with their `file:line` in the text.

## The flow

### 1. Get the PR node ID, head commit, and any pending review by the viewer

In one query, grab the PR ids and check whether the current user already has a pending review on this PR. If they do, you must append to it instead of starting a new one (GitHub returns `A pull request review already exists for this user` if you try to create a second).

```bash
gh api graphql -f query='
query($owner:String!, $repo:String!, $number:Int!) {
  viewer { login }
  repository(owner:$owner, name:$repo) {
    pullRequest(number:$number) {
      id
      headRefOid
      baseRefName
      headRefName
      reviews(first: 50, states: PENDING) {
        nodes { id author { login } }
      }
    }
  }
}' -F owner=OWNER -F repo=REPO -F number=NUMBER
```

From the response:
- `pullRequest.id` is the PR node ID (`PR_kwDO...`).
- `pullRequest.headRefOid` is the latest commit SHA.
- `viewer.login` is the current GitHub user.
- Look through `reviews.nodes` for one whose `author.login` matches `viewer.login`. If found, save its `id` (`PRR_...`) as `existingReviewId`. That is the pending review to append to.

### 2. Confirm which files are actually in the PR diff

GitHub only accepts inline comments on files (and lines) that are part of the PR's diff vs the merge-base. The local `git diff base..head` can include files that GitHub does not count, for example when the base branch advanced past the PR's merge-base.

```bash
gh api "repos/OWNER/REPO/pulls/NUMBER/files?per_page=100" | jq -r '.[].filename'
```

For each finding:
- File is in the list and the target line is in a hunk → inline comment.
- File is not in the list, or the target line is not in any hunk → put the finding in the review `body` instead, and reference the file and line in the text.

### 3. Pick a line that GitHub will accept

GitHub's GraphQL `threads` field takes `path`, `line`, and `side` (`RIGHT` or `LEFT`). Rules of thumb that have worked:

- Lines that are added or modified on the right side: `side: RIGHT`, `line: <new file line>`. This almost always works.
- Lines that were removed: `side: LEFT`, `line: <old file line>`.
- Context lines (unchanged lines that just happen to be in a hunk): sometimes accepted, sometimes not. If `Path could not be resolved` comes back, move to a nearby added/changed line and reference the real line in the body.
- The very first line of a hunk has historically been finicky. If the first line fails, try the next one.

If the actual issue line is outside any hunk, anchor on the closest in-hunk line and say "Off-topic for this exact hunk, but at line N: ..." in the body.

### 4. Build the mutation (two paths)

Use `addPullRequestReview` with the `threads` field (not the deprecated `comments` field, which requires `position` in the unified diff and is harder to compute).

Write each mutation to a file at `/tmp/review.graphql` to keep the shell escaping sane, then run `gh api graphql -F ... -F query=@/tmp/review.graphql`.

#### Path A: no existing pending review (create + submit in one mutation)

```graphql
mutation($prId: ID!, $oid: GitObjectID!) {
  addPullRequestReview(input: {
    pullRequestId: $prId,
    commitOID: $oid,
    event: APPROVE,  # or REQUEST_CHANGES or COMMENT
    body: "Top-level review summary. Keep it short. Use this for findings on files that are not in the diff.",
    threads: [
      {
        path: "path/to/file.tsx",
        line: 42,
        side: RIGHT,
        body: "The inline comment. Two or three sentences."
      }
    ]
  }) {
    pullRequestReview { id url state }
  }
}
```

Run it:

```bash
gh api graphql \
  -F prId="PR_kwDO..." \
  -F oid="abc123..." \
  -F query=@/tmp/review.graphql
```

#### Path B: pending review already exists (append, then submit)

If step 1 found an `existingReviewId`, do not call `addPullRequestReview` again. Instead:

1. Append each new thread to the existing pending review with `addPullRequestReviewThread`.
2. If the user also wants a top-level body, `submitPullRequestReview` already takes a `body` argument (see below) and that is the simplest place to set it. If you need to update the body before submitting, use `updatePullRequestReview`, but note that it replaces the existing body, so fetch it first with `pullRequestReview(id: $reviewId) { body }` if you want to keep what is already there.
3. Submit the review with `submitPullRequestReview`.

```graphql
# One call per thread (or batch as separate fields with aliases).
mutation($reviewId: ID!) {
  t1: addPullRequestReviewThread(input: {
    pullRequestReviewId: $reviewId,
    path: "path/to/file.tsx",
    line: 42,
    side: RIGHT,
    body: "Comment one."
  }) { thread { id } }
  t2: addPullRequestReviewThread(input: {
    pullRequestReviewId: $reviewId,
    path: "path/to/other.tsx",
    line: 7,
    side: RIGHT,
    body: "Comment two."
  }) { thread { id } }
}
```

Then submit:

```graphql
mutation($reviewId: ID!) {
  submitPullRequestReview(input: {
    pullRequestReviewId: $reviewId,
    event: APPROVE,  # or REQUEST_CHANGES or COMMENT
    body: "Optional final body. Appended to whatever was already on the review."
  }) {
    pullRequestReview { id url state }
  }
}
```

If the user only wants to add threads and leave the review pending (no submit yet), stop after the `addPullRequestReviewThread` calls and tell them the review is still pending so they can keep adding to it.

A successful response in either path looks like:

```json
{"data":{"...":{"pullRequestReview":{"id":"PRR_...","url":"https://github.com/.../pull/N#pullrequestreview-...","state":"APPROVED"}}}}
```

Show that URL back to the user.

### 5. Multi-line comments (optional)

For comments that should span a block, add `startLine` and `startSide`:

```graphql
{
  path: "foo.ts",
  startLine: 10,
  startSide: RIGHT,
  line: 14,
  side: RIGHT,
  body: "..."
}
```

## Gotchas (real ones, learned the hard way)

- **`event: PENDING` is not valid** for `addPullRequestReview`. Omit `event` to leave the review pending; pass `APPROVE` / `REQUEST_CHANGES` / `COMMENT` to submit immediately.
- **`A pull request review already exists for this user`** means you have a pending review on this PR. Do not delete it (the user may have written threads in it). Switch to Path B: fetch the existing review id, append threads with `addPullRequestReviewThread`, and submit with `submitPullRequestReview`.
- **`Path could not be resolved`** almost always means: the file is not in the PR's diff vs the merge-base, or the line is not in any hunk on the requested side. Re-check with `gh api .../pulls/N/files` and adjust.
- **One file can disappear from the PR diff** when the base branch advances. The local `git diff` will still show the change, but GitHub will reject inline comments on it. Move the finding to the review body.
- **Single quotes inside the body**: when writing the GraphQL to a heredoc and using single-quoted strings, escape inner single quotes with `'\''` (close, escaped quote, reopen). Easier alternative: use double quotes inside and rely on JSON-style escapes.
- **Always write the mutation to a file** instead of inlining it on the command line. The threads array is verbose and shell escaping eats the body content. Use `gh api graphql -F query=@/tmp/review.graphql`.
- **Prefer one mutation when starting fresh.** If there is no pending review, use `addPullRequestReview` with the `threads` array and an `event`, all in one call. Only fall back to the multi-call `addPullRequestReviewThread` + `submitPullRequestReview` flow when a pending review already exists (Path B). Whichever flow you use, always submit at the end unless the user explicitly wants to leave the review pending.
- **The auto-mode classifier may block a bare pending review** (a review with no inline comments and no clear intent to add them). Always include the `threads` array in the same mutation, or be explicit in the body that this is step one of a multi-step flow.
- **Test a single thread first** when something fails. A minimal mutation with one thread tells you which path/line is the problem.

## Checklist before submitting

- [ ] PR node ID and head OID fetched
- [ ] Checked for an existing pending review by the current user; chose Path A (create) or Path B (append + submit)
- [ ] List of changed files from `pulls/N/files` checked against findings
- [ ] Each inline finding mapped to a line that is in a hunk
- [ ] Findings on files not in the diff moved to the body
- [ ] Tone passes the smell test: a junior dev would understand it, short, plain words, no em dashes, no insider vocabulary
- [ ] Severity leads each comment when the findings are graded
- [ ] Review body is one or two sentences and does not repeat the threads
- [ ] `event` set to `APPROVE`, `REQUEST_CHANGES`, or `COMMENT` (whatever the user asked for)
- [ ] Mutation written to `/tmp/review.graphql`, not inlined
- [ ] Response URL shown to the user

## Recovery: deleting a botched review

If the submitted review is wrong, pending reviews can be deleted:

```graphql
mutation { deletePullRequestReview(input: { pullRequestReviewId: "PRR_..." }) { pullRequestReview { id } } }
```

Submitted reviews cannot be deleted, only dismissed (by someone with the right permission, via `dismissPullRequestReview`). Better to get the first one right.
