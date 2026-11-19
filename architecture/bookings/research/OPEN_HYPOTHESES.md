# Bookings — Open Hypotheses

| ID | Hypothesis | Status |
|----|------------|--------|
| BKG-HYP-001 | Caller with org membership + `bookings.read` (or legal-doc audit perm) but without ACTIVE `RENTAL` could use Documents / legal-delivery-evidence HTTP while `BookingsController` returns 403 | INFERRED from guard diff — **not HTTP-verified** in F1 remediation |