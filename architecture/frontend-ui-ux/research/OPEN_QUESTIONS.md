# Open Questions — Frontend UI/UX

| ID | Question | Blocks AUTHORITY_ACTIVE? |
|----|----------|--------------------------|
| FEUX-OQ-PROD-AUTH-001 | Owner-approved read-only authenticated UI verification on Production without ad-hoc sessions? | Yes (functional leg) |

1. Which Figma (if any) is production-aligned for Rental vs Master at redesign kickoff? (**UNKNOWN**)
2. Should Master remain query-param SPA or adopt path-segment routes for shareable control-plane URLs? (Product decision — **not decided**)
3. Is orphan `RightSidebar.tsx` delete-safe or reserved for dashboard widgets? (Code archaeology — **open**)
4. Production UI baseline SHA and parity attestation? (Requires owner-authorized VPS/browser audit)