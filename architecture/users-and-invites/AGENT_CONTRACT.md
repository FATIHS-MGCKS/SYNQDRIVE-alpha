# Users & Invites — agent contract

1. Read this authority before substantive user/IAM/Master Admin changes.
2. Do **not** create competing flat `architecture/IAM_*.md` authorities.
3. Preserve Organizations offboarding ownership boundaries.
4. Production changes require separate owner authorization.
5. Promote to `AUTHORITY_ACTIVE` only after Production read-only baseline per `MODULE_AUTHORITY_STANDARD.md`.
6. Run `bash architecture/scripts/validate-module-registry.sh` and `bash architecture/users-and-invites/scripts/validate-graph.sh`.