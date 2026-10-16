# EXP021 EV Ground Truth — post-deploy verification plan

**Status:** `POST_DEPLOY_VERIFICATION_STATUS=COMPLETE_READ_ONLY_2026-10-16`  
**Trigger:** Owner-authorized joint deploy @ `c1013265bc10af7ac5fe7e86ff372772373acd36` — see [EXP021_EV_GROUND_TRUTH_POST_DEPLOY_VERIFICATION_2026-10-16.md](./EXP021_EV_GROUND_TRUTH_POST_DEPLOY_VERIFICATION_2026-10-16.md).

## Read-only checklist

1. Record **deployed Production SHA** (not target SHA).  
2. Re-run `npm run exp021:ev-ground-truth:baseline` with `EXP021_EV_GT_BASELINE_PHASE=POST_DEPLOY` into `post-deploy/` (new directory; do not overwrite `pre-deploy/`).  
3. Verify identities unchanged: trip → PRIMARY WI → shadow → pinned snapshot → CURRENT V2 projection id (or document supersession).  
4. Compare `admission.evaluation` — expect admission satisfied if reconcile ran; **expectation only** until observed.  
5. Run `productReadBoundaryGate` — document pass/fail vs pre-deploy.  
6. Authenticated product GET for trip speed quality (if credentials available) — redacted summary in authority doc only.  
7. Confirm reference evaluation tooling still runs against new SHA (analysis code SHA = deploy commit).  

## If boundaries changed

- Keep `pre-deploy/` frozen  
- Add `post-deploy-rev-<n>/` with explanation of boundary fingerprint / repair generation delta  
- Do not overwrite pinned work item evidence  

## Explicit prohibitions

Same as pre-deploy: no manual admission writes, provider calls, outbox resets, or forced reprojection in Production.
