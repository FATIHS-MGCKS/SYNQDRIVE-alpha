# Bookings — Knowledge Gaps

| Gap ID | Topic | Epistemic | Notes |
|--------|-------|-----------|--------|
| BKG-GAP-DOC-PRODUCT-LICENSE-001 | Booking document HTTP vs P6-PR3 product license | **REMEDIATED** (P6-PR4A) | HTTP-confirmed bypass; guards added. Evidence: `BKG-EVID-HTTP-DOC-LICENSE-2026-11-19.md` |
| BKG-GAP-PROD-COUNTS-001 | Production booking row counts | UNKNOWN | No bounded SQL in bootstrap audit |
| — | Operator sheet operational availability parity | UNKNOWN | P1.6 cutover doc partial |
| — | Full feature-flag matrix for payments on bookings | UNKNOWN | Payments module not bootstrapped |
| — | End-to-end Production trace of wizard confirm | UNKNOWN | No synthetic booking allowed |
| — | PM2/systemd topology on VPS | UNKNOWN | Empty pm2 list for SSH user |
| — | Documents module authority (incl. `LegalDocumentsController`) | NOT_STARTED | Org legal-text routes not mapped here |