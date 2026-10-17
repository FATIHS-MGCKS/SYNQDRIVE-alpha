# LDI04 — Next decision

1. Accept **L3-first** fusion policy draft for Ruptela pins with sparse `INTERVAL_ONLY` OBD.
2. Do **not** enable OBD speed fallback — conflicts are majority **EXPLAINED** by sparsity/zero-OBD, remainder **UNRESOLVED**.
3. For native-event matrix validation, pin a trip with non-zero `DrivingEvent` rows (owner-approved DB export) before LDI-05.

Repro: `cd backend && npm run ldi04:fusion-forensics`