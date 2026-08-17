# R3B1R.3.3a — Swagger / js-yaml Upstream Security Blocker Re-entry Gate

**Phase:** `CI-R3B1R.3.3a`
**Generated:** `2026-08-17T01:48:07+00:00`
**Result:** **BLOCKED**
**Machine status:** `CI_R3B1R33A_SWAGGER_JS_YAML_REENTRY_GATE_COMPLETED_UPSTREAM_BLOCKED`

## Summary

- JS_YAML_SECURITY_AUTHORITY=`CORRECTED`
- JS_YAML_GHSA_PM4M_FIRST_SAFE_VERSION=`5.2.2`
- R3B1R33_FIXED_VERSION_ASSERTION_CORRECT=`false` (R3B1R.3.3 incorrectly asserted `>=5.3.0`)
- SWAGGER_LATEST_RELEASE=`11.4.6`
- SWAGGER_LATEST_JS_YAML_DEPENDENCY=`5.2.1`
- SWAGGER_4027_STATE=`open` (target js-yaml `5.2.2`, head `9665a040504ae6f2644d8b560e070171a13caa86`)
- SAFE_SWAGGER_RELEASE_AVAILABLE=`false`
- FIRST_RELEASED_SWAGGER_WITH_SAFE_JS_YAML=`null`
- DATABASE_RECONCILIATION_ACCEPTANCE=`PRESERVED_ACCEPTED_FINAL`
- FRAMEWORK_UPGRADE_TOPOLOGY=`FROZEN_SUPPORTED_BUT_UPSTREAM_BLOCKED`
- R3B1R34_READINESS=`NOT_READY_PENDING_RELEASED_SWAGGER_SECURITY_FIX`
- PR1054_MERGE_READINESS=`BLOCKED`

## 1. Clean entry

- ENTRY_HEAD_SHA=`47b1e673f10ce2a15cdba725017702e039ac714b`
- PR_HEAD_SHA=`47b1e673f10ce2a15cdba725017702e039ac714b`
- CURRENT_MAIN_SHA=`721ad893d15cfa46786a112860548ce12a2be71d`
- PR_STATE=`open`
- PR_IS_DRAFT=`True`
- WORKTREE_CLEAN_AT_ENTRY=`true`

## 2. Database acceptance preserved

- SCHEMA_SHA=`6818b91b2486b83a97351b86f1f25b75271b07a490ad7711618928f078906c17` (expected `6818b91b2486b83a97351b86f1f25b75271b07a490ad7711618928f078906c17`)
- MIGRATION_TREE_SHA=`868dcbb8cef8078cbc16d70c939751b470f45bb01fa420f023119d45259beee6` (expected `868dcbb8cef8078cbc16d70c939751b470f45bb01fa420f023119d45259beee6`)
- DATABASE_SOURCE_CHANGED=`0`
- PRISMA_TOOLCHAIN_CHANGED=`False`

## 3. R3B1R.3.3 fix-version defect correction

- GHSA-pm4m-ph32-ghv5 vulnerable range: `>= 5.0.0, <= 5.2.1`
- Authoritative first patched version: `5.2.2`
- R3B1R.3.3 asserted `>=5.3.0` without advisory evidence — **incorrect**

## 4. Current upstream @nestjs/swagger

- Latest release: `11.4.6`
- Declared js-yaml: `5.2.1`
- PR #4027: `https://github.com/nestjs/swagger/pull/4027` — `open` (not merged; bumps js-yaml to `5.2.2`)

## 5. Released-version search (>= 11.4.6, Nest 11 peers)

| VERSION | JS_YAML | NEST_COMMON_PEER | ACCEPTABLE |
|---|---|---|---|
| 11.4.6 | 5.2.1 | ^11.0.1 | False |

- FIRST_RELEASED_SWAGGER_WITH_SAFE_JS_YAML=`null`

## 6. Corrected re-entry condition

- Invalid prior: `wait for js-yaml >=5.3.0`
- Valid re-entry: wait for a released @nestjs/swagger version whose declared dependency resolves to a js-yaml version outside all currently applicable High/Critical vulnerable ranges
- REENTRY_REQUIRES_ZERO_HIGH_ZERO_CRITICAL=`true`
- CURRENT_GHSA_PM4M_SAFE_RANGE=`>=5.2.2`
- CURRENT_OTHER_JS_YAML_HIGH_RANGES (4.x/3.x lines, not applicable to swagger 11.4.6 pin): GHSA-5p4m-2wfm-xmqj (`>=4.0.0,<4.3.1`, patched `4.3.1`), GHSA-52cp-r559-cp3m, GHSA-8j8c-7jfh-h6hx

## Inherited R3B1R.3.3

- Prior status: `CI_R3B1R33_NESTJS11_SECURITY_UPGRADE_PREFLIGHT_BLOCKED`
- Frozen Nest 11 topology preserved; js-yaml re-entry threshold corrected from hardcoded `>=5.3.0` to advisory-backed `>=5.2.2`

## 7–11. Disposable spike / OpenAPI

Not executed — no released @nestjs/swagger version satisfies the security gate without override.

**R3B1R.3.3a DID NOT MUTATE PRODUCTION.**
**R3B1R.3.3a DID NOT IMPLEMENT THE NESTJS 11 UPGRADE.**
**PR #1054 WAS NOT MERGED.**
