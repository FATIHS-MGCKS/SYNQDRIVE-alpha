# HV R22 P1B — public Git history remediation (owner gate)

## Problem

PR #2091 branch history may contain commits that once checked in production-derived P1B research exports (session UUIDs, GPS, DIMO token references). Sanitized fixtures on the branch tip do **not** remove objects already reachable from earlier commits on the same branch.

## Minimal-invasive publish path (no force-push, no rewrite)

1. Create a **new** branch from current `origin/main`:
   - `git checkout origin/main`
   - `git checkout -b cursor/hv-r22-p1b-sanitized-42a8`
2. Apply the **tip tree** of the hardened R22 work as **one or few new commits** (no cherry-pick of research-export commits):
   - `git checkout <hardened-tip> -- <paths-for-r22-only>`
   - Or `git diff origin/main...<hardened-tip> | git apply` after review
3. Open a **new PR** targeting `main`; leave PR #2091 closed or marked superseded.
4. **Owner gate (GitHub):** delete or restrict the old remote branch `cursor/hv-r22-pilot-p0-allowlist-42a8` after the new PR is approved, so default clones do not retain the old fixture blobs on an active branch tip.

## What this does not do

- No `git push --force` or history rewriting on shared branches.
- Does not purge objects from GitHub storage (requires platform support / unreachable blob GC after branch deletion and time).

## Local research archives

Off-repository research artifacts remain the forensic source of truth; the repository retains only synthetic replay fixtures documented under `fixtures/p1b-research/README.md`.
