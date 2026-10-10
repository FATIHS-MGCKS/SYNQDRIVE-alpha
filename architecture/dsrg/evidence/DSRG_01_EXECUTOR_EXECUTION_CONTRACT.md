# DSRG-01 — Pinned deploy execution contract

**Mode:** offline engineering  
**Production:** no mutation of installed pin `40c6dd9`

## Symptom

`vps-vo5c-run-pinned-security-deploy.sh` used `exec "$PINNED_DEPLOY_SCRIPT"`. Git tracks `vps-deploy-release.sh` as **100644**. Fresh pinned checkouts (P6) keep ops tree git-clean → deploy script is not executable → **EACCES** at authorized deploy time.

## Why preflight missed it

`vps-vo5c-first-security-deploy-preflight.sh` checks existence, `HEAD` SHA, and git porcelain under `backend/scripts/ops`; it does not perform `exec` on the deploy path. H4 selftest used `bash "$PINNED_DEPLOY_SCRIPT"` (compatible), not the runner’s `exec` line.

## Reproduction (isolated)

```bash
chmod 644 vps-deploy-release.sh   # matches git index
exec ./vps-deploy-release.sh      # exit 126 Permission denied
bash ./vps-deploy-release.sh …    # invokes interpreter
```

Selftest: `backend/scripts/ops/vps-vo5c-pinned-deploy-execution-contract.selftest.sh`

## Correction (minimal)

```bash
exec bash "$PINNED_DEPLOY_SCRIPT" "$@"
```

Preserves: git-clean integrity, security-floor libs loaded inside deploy script, no auto-authorization.

## Promotion note

Installed production pin at `40c6dd9` **does not** include this fix until a **new pinned executor promotion** (or hotfix pin SHA). Live app deploy is not required for the code fix to land in git.
