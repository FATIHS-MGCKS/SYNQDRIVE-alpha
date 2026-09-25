# Qualified Stop V1 — isolated production release candidate (validation only)

| Field | Value |
|-------|--------|
| **Base (Production)** | `2b0ef15fc80069676cd44f1b852a362434f7ffb7` |
| **Source PR #1750 merge** | `3067fad1aad509c29b2c83a6f3f0b16135da7a63` (semantic net diff only) |
| **Source PR #1753 merge** | `b0a7cd08942e94cf0ff5010b417d4b2beabedca6` (semantic net diff only) |
| **Strategy** | Net diff from Production base → trip FSM + `worker.config.ts` paths only |
| **Unrelated main commits included** | **NO** (no Battery/ERD/migrations/frontend master UI) |
| **Deploy** | **NOT authorized by this document** — exact-head CI validation only |
