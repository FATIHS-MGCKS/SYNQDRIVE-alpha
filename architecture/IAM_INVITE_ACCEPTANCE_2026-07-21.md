# IAM Invite Acceptance — Architecture (2026-07-21)

## Components

| Component | Role |
|-----------|------|
| `InviteAcceptService` | Validate + accept flows, identity binding, transactional membership |
| `invite-accept.policy.ts` | Privileged role, rejoin acknowledgement rules |
| `identity-email.util.ts` | Canonical email normalization |
| `optional-auth.util.ts` | Optional JWT parse on public `/invites/accept` |
| `IamAuditOutboxRepository` | Durable audit rows inside accept transaction |
| `IamAuditOutboxProcessorService` | Post-commit audit fan-out |

## Public endpoints

- `POST /invites/validate` — anonymous preview
- `POST /invites/accept` — public path with optional Bearer for existing users

## Security invariants

- Existing users cannot accept without matching authenticated identity
- Removed/suspended memberships require explicit `acknowledgeRejoin`
- Privileged roles require explicit `acknowledgePrivilegedRole`
- Token hash invalidated on accept; lookup retained for idempotent status checks
