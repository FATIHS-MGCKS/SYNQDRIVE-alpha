# P6D — Binding organization offboarding owner policies

**Approved:** 2026-11-22  
**Status:** Binding for P6D2+ implementation

1. **SUSPENDED** stops new routine DIMO/HM polling; ongoing trips handled safely (scheduler change deferred P6D4).
2. **ARCHIVED** only after successful controlled offboarding; generic MA PATCH bypass closed in P6D4.
3. Suspension never auto-cancels Stripe.
4. Offboarding **finalization** blocked by org-wide ongoing trips / relevant bookings; **suspend** remains independent.
5. Provider revocation failures block **ARCHIVED**; org stays **SUSPENDED**; retryable + auditable (execution P6D3+).
6. Legal holds block **destructive** ops; non-destructive archival classification via preflight **REVIEW_REQUIRED**; hard delete stays 409; no `OrganizationStatus.OFFBOARDED`.