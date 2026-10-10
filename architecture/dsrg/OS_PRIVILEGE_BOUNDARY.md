# OS privilege boundary

Script-level guards are insufficient against root shell bypass. Production activation requires:

1. Root-owned pin trees; config `0600`
2. Authority file `0444` + optional armed stamp monitoring
3. **sudoers** (example: `vo5c-production-deploy-privilege-boundary.sudoers.example`) — `env_reset`, pinned runner only for deploy role
4. Cloud-agent shallow-fetch deploy blocked when authority active

**Status (2026-10-10):** sudoers not installed; enforcement not active; `ROOT_BYPASS_RISK: HIGH` per P4B15 evidence.

## Pin promotion vs enforcement

| Action | Authorized in P6 | Requires enforcement |
|--------|------------------|----------------------|
| Install new pin tree + config pointer | Yes | No |
| `ENFORCEMENT_ACTIVE=1` | No | Yes + dual approval |
