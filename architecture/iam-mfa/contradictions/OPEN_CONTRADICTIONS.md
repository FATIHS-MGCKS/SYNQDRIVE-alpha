# IAM MFA — Open contradictions

## IAM-MFA-CX-001 — Merged implementation vs Production activation

| Field | Value |
|-------|-------|
| **Epistemic** | CONTRADICTED (unresolved) |
| **Side A** | Repository on `59182a9de` contains full IAM MFA module, guards, migrations, and tests (**CONFIRMED**) |
| **Side B** | Production runtime MFA enforcement **UNKNOWN**; historical observation **unset** flags; 2026-11-18 SSH cannot read `.env` |
| **Resolution** | **OPEN** — requires operator attestation or permitted read-only env inspection |
| **Agent rule** | Never infer Production MFA **on** from merge alone |