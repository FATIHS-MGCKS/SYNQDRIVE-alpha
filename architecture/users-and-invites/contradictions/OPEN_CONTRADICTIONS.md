# Open contradictions

| ID | Statement | Epistemic |
|----|-----------|-----------|
| USR-CON-001 | MA UI canonical path is Security & Access but `App.tsx` still calls legacy `admin/users` list | **RESOLVED_REPO** — USR-P1B removed mount `listAll`; backend routes remain (USR-P3) |
| USR-CON-002 | Billing mutations use transactional audit; session revoke uses fire-and-forget audit | CONFIRMED — R-002 |