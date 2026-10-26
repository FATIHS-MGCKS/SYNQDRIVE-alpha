# Open PR Inventory Methodology — August 2026

## Scope and safety

This run was read-only against GitHub and Git history except for the six audit artifacts committed on `audit/repository-pr-recovery-inventory-2026-08`. It did not merge, close, edit, relabel, rebase, force-push, delete branches, or change review readiness.

## Recorded environment

- Repository: `FATIHS-MGCKS/SYNQDRIVE-alpha`
- Run start: `2026-08-10T15:20:16Z`
- Artifact generation: `2026-08-10T15:36:49Z`
- `origin/main`: `2d721a902feb56101eb9992249f1859ff64024cb`
- Git: `git version 2.43.0`
- GitHub CLI: `gh version 2.91.0 (2026-04-22)`
- Authenticated identity observed through GraphQL: `cursor[bot]`
- Authentication: GitHub CLI authenticated; GraphQL/REST reads and Git fetch succeeded. No token or secret is recorded.
- Permission reporting: GraphQL `viewerPermission` returned `null`; REST repository `permissions` reported all five fields false. These conflict with successful public reads/fetch, so no write permission was inferred during collection.

## Reproducible collection sequence

```bash
git fetch --all --prune
git rev-parse origin/main
git checkout -b audit/repository-pr-recovery-inventory-2026-08 origin/main
gh --version
git --version
gh auth status
gh api graphql -f query='query { repository(owner:"FATIHS-MGCKS",name:"SYNQDRIVE-alpha") { pullRequests(states:OPEN) { totalCount } } }'
```

1. Open PRs were ordered by `CREATED_AT ASC` and paginated with `first:100` and `after:endCursor`; seven pages yielded 625 unique PR numbers and `totalCount=625`.
2. A second seven-page query resolved `headRef` and `baseRef`; all 625 head and base refs were present.
3. Each PR was queried by number for files, commits, labels, latest reviews, mergeability, and head checks. Every nested connection followed `hasNextPage`; node counts equal all `totalCount` values.
4. Every open head was fetched with `git fetch --no-tags origin +refs/pull/<N>/head:refs/audit/pr/<N>` and compared to API `headRefOid`.
5. Titles are display-only and never classification inputs.

## Analysis definitions

- Commit reachability uses membership in `git rev-list origin/main`.
- Patch equivalence uses `git cherry origin/main <head>` only for API-listed commits not directly reachable from main. `-` is equivalent, `+` unmatched, and unrepresented commits produce `UNKNOWN`. Reachability and equivalence are separate.
- Main branch diff uses `git diff --name-status -M origin/main...<head>`; two-tree `git diff origin/main <head>` is separately recorded.
- Duplicate evidence is exact equal head SHA, equal API commit set, or equal SHA-256 of `git diff --binary <merge-base> <head>`. It only produces `POSSIBLE_DUPLICATE`.
- One commit DAG (`git rev-list --parents --topo-order --reverse`) establishes exact open-head ancestry. Explicit base/head branch matches are separate evidence. Ancestry is classified before duplication.
- File overlap is exact changed target-path equality across all open PRs.
- Deleted and renamed target paths use GraphQL `changeType`. A path absent from current main may be an addition or rename and is not assumed deleted.
- `STALE` means at least 30 whole days since `updatedAt` at `2026-08-10T15:20:16Z`; it is not a closure recommendation.
- Module classification uses changed-path regexes. Documentation-only maps to `documentation`; multiple product domains map to `cross-cutting`; unmatched maps to `unknown`.

## CI, review, and classifications

`ci_status` is the head commit `statusCheckRollup.state`; absence is `NO_CHECKS_REPORTED`. `review_status` is `reviewDecision` or `NO_REVIEW_DECISION`. JSON includes checks, review count, and latest review states. Every PR has evidence tags and one mutually exclusive primary category for counting. No category is a merge or closure decision.

## Errors and limitations

- Two oversized initial GraphQL requests returned HTTP 502. The successful fallback used lightweight full pagination plus 625 individually paginated detail queries; all succeeded.
- GitHub data is not transactional across calls. SHA/ref checks detect head movement, but checks, reviews, labels, and mergeability can change immediately after collection.
- Mergeability and check rollups are point-in-time server calculations; `UNKNOWN` is preserved.
- GraphQL rename records expose the target path but not the previous filename, so previous names are not invented.
- Permission metadata exposed no positive permission despite successful public reads; this is documented, not interpreted.
- No DIMO or Figma integration was used because no product integration or UI changed.

## Validation gates

- Open total = core rows = unique numbers = detail rows = ref rows = 625.
- All nested node counts equal `totalCount`; all `hasNextPage` values are false.
- Every local PR ref equals API `headRefOid`.
- JSON parsing, CSV shape/625 rows, summary recomputation, and cross-file consistency are validated after generation.
