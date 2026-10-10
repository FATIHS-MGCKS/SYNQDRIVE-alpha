# Vehicle Warnings — Deployment & Rollback Plan

| Feld | Wert |
|------|------|
| **Audit-ID** | `vehicle-warnings-production-readiness-2026-07` |
| **Prompt** | **25 von 26** |
| **Erstellt (UTC)** | 2026-07-25 |
| **Modus** | Planung only |
| **Deploy-Mechanismus** | `bash .cursor/scripts/cloud-agent-deploy.sh` → VPS `vps-deploy-release.sh` |

---

## 1. Deploy-Grundsätze

| Regel | Beschreibung |
|-------|--------------|
| **Ein Deploy = ein Work Package** | Kein Multi-Phase-Bundle |
| **Expand before contract** | DB: add columns/tables first; drop später |
| **Feature flag default off** | Prod-Verhalten unverändert bis explizite Aktivierung |
| **Backup vor Migration** | VPS deploy script: DB backup automatisch |
| **Health gate** | `https://app.synqdrive.eu/api/v1/health` nach jedem Deploy |
| **Kein Queue flush** | Jobs nicht löschen; DLQ für replay |
| **Shadow before switch** | UI-Flags erst nach Δ=0 |

---

## 2. Deploy-Reihenfolge pro Release-Typ

### 2.1 Hotfix Release (Phase 0, 17)

**Wann:** Security (WP-B0) oder Battery V2 (WP-17).

| Schritt | Aktion | Dauer |
|---------|--------|-------|
| 1 | `git push origin main` | — |
| 2 | `bash .cursor/scripts/cloud-agent-deploy.sh` | ~10–15 min |
| 3 | PM2 restart (automatisch via deploy script) | — |
| 4 | Flag `VW_SEC_INTELLIGENCE_GUARD=true` in backend.env | manuell |
| 5 | T-SEC-* smoke | 5 min |
| 6 | Monitor error.log 30 min | — |

**Rollback:** Flag off + redeploy previous release tag if needed.

**Bekanntes Risiko:** 12 Nginx 502s während Deploy-Fenster (Runtime Audit) — Health-Check abwarten.

---

### 2.2 Migration Release (Phase 2–4, 16)

**Wann:** Schema expand, backfill scripts.

| Schritt | Aktion |
|---------|--------|
| 1 | Staging: migration + backfill dry-run |
| 2 | Prod backup verify (deploy script) |
| 3 | Deploy code with migration **disabled** (flag) |
| 4 | Run migration: `npx prisma migrate deploy` (via deploy script) |
| 5 | Run backfill script idempotent (`--dry-run` then `--execute`) |
| 6 | Verify counts (SQL read-only queries in `queries/`) |
| 7 | Enable feature flag |

**Rollback-Matrix:**

| Migration | Rollback |
|-----------|----------|
| M1 add_vehicle_finding | Flag off; table unused OK |
| M2 dtc unique + merge | **Down migration** only before unique enforced; post-merge: manual split script |
| M3 insight dedupe | Down before unique live |
| M4 cascade change | Down restores CASCADE (data risk — avoid post-backfill) |
| M5 notification finding_id | Flag off; nullable column OK |

**Regel:** Nach backfill + unique live → **kein Down** ohne Ops-Freigabe.

---

### 2.3 Code-Only Release (Phase 5–8, 13–15)

| Schritt | Aktion |
|---------|--------|
| 1 | Deploy with all flags **off** |
| 2 | Enable shadow mode flag (`RUNTIME_PROJECTION_SHADOW_MODE=true`) |
| 3 | Monitor metrics 7d |
| 4 | Enable consumer flags one-by-one |

**Rollback:** Per-flag `false`; kein Redeploy nötig wenn code backward compatible.

---

### 2.4 Frontend Release (Phase 9–12)

| Schritt | Aktion |
|---------|--------|
| 1 | Backend flags + API fields live first |
| 2 | Deploy frontend with UI flags off |
| 3 | Enable `VW_FLEET_CMD_RUNTIME_V1` per org (pilot) |
| 4 | Expand to all orgs after 48h clean |

**Rollback:** UI flag off → sofort alte Darstellung.

---

## 3. Feature-Flag-Rollout-Plan

```
Week 0: WP-B0 security ON (all orgs)
Week 1: Phase 2-4 migrations + flags off
Week 2: Phase 5 blocking policy shadow
Week 3-4: Phase 6 runtime shadow ON (pilot org)
Week 5: Phase 7 API fields ON (dual read)
Week 6: Phase 9 Fleet Command pilot
Week 7: Phase 10-11 expand
Week 8: Phase 13 notifications
Week 9-10: Phase 16 GDPR (legal gate)
Ongoing: Phase 17 battery fix ASAP (parallel Week 0-1)
```

**Pilot-Org:** Eine anonymisierte Prod-Org mit ~5 NV2 health vehicles (Runtime Audit Stichprobe).

---

## 4. Shadow-Mode-Deployment

| Parameter | Wert |
|-----------|------|
| Flag | `RUNTIME_PROJECTION_SHADOW_MODE` |
| Verhalten | Alte + neue Projection parallel berechnen; UI zeigt **alte** |
| Metriken | `vehicle_warnings_shadow_count_delta` |
| Log sampling | 1% vehicles mit Δ≠0 → structured log |
| Dauer max | 14 Tage |
| Umschaltung | `RUNTIME_PROJECTION_SHADOW_MODE=false` + consumer flags on |

**Abort:** Δ>0 an 2 konsekutiven Tagen → Shadow verlängern; Root-cause vor Umschaltung.

---

## 5. Backfill-Deployment

| Backfill | Script | Idempotenz | Approval |
|----------|--------|------------|----------|
| DTC duplicate merge | `ops/backfill-dtc-dedup.ts` (neu) | ON CONFLICT | Ops + dry-run report |
| findingId link notifications | `ops/backfill-finding-ids.ts` (neu) | fingerprint match | Auto after M1 |
| Insight PII scrub | `ops/scrub-insight-pii.ts` (neu) | row version check | Legal + Ops |
| Battery re-eval | existing processor replay | job idempotency | After WP-17 fix |

**Nie in Peak Hours:** Backfills 02:00–05:00 UTC; batch size 100; pause on DB load > 70%.

---

## 6. Rollback-Szenarien

### 6.1 Vollständiger Rollback (kritischer Incident)

| Schritt | Aktion |
|---------|--------|
| 1 | Alle VW flags → `false` in backend.env + frontend.env |
| 2 | `CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1` redeploy previous `main` SHA |
| 3 | Verify health endpoint |
| 4 | Check queue failed counts |
| 5 | Incident postmortem |

**Zeitbudget:** < 15 min to previous behavior (flags) or < 30 min (full redeploy).

---

### 6.2 Partieller Rollback (ein Surface)

| Szenario | Aktion |
|----------|--------|
| Fleet Command counts wrong | `VW_FLEET_CMD_RUNTIME_V1=false` |
| Booking blocked incorrectly | `VW_BLOCKING_POLICY_SSOT=false` **sofort** |
| DRIVER 403 storm | `VW_SEC_INTELLIGENCE_GUARD=false` nur wenn false positive |
| Battery queue spike | Disable `battery.v2` job types via env |

---

### 6.3 DB Migration Rollback

| Phase | Aktion |
|-------|--------|
| Pre-unique | `prisma migrate resolve --rolled-back` + deploy previous |
| Post-unique | **Kein automatisches Down** — forward fix only |
| Post-backfill | Restore from backup (last resort; Charter A1 violation — nur Incident) |

---

## 7. Monitoring während Deploy

| Signal | Threshold | Aktion |
|--------|-----------|--------|
| `synqdrive-error.log` HANDLER_FAILED battery | >0 / 5min | Pause rollout |
| `bull:battery.v2` failed | >5 | WP-17 priority |
| Nginx 502 rate | >1/min | Wait for health |
| PM2 restart | >3 / 1h | Hold deploy |
| `vehicle_warnings_shadow_count_delta` | ≠0 | No UI flag enable |
| API p95 rental-health | >2x baseline | Investigate cache |

**Referenz-Baseline:** Runtime Audit 2026-07-25 (`6080dbd2`).

---

## 8. Post-Deployment Verification (Phase 19)

### 8.1 Automatisiert (innerhalb 15 min)

```bash
curl -sf https://app.synqdrive.eu/api/v1/health
cd backend && npm test -- --testPathPattern="security-negative|rental-health|deriveIsReady"
```

### 8.2 Read-Only Prod Checks

| Check | Query/Method |
|-------|--------------|
| DTC duplicates | `queries/dtc-active-count.sql` |
| Battery failed jobs | Redis `bull:battery.v2` failed count |
| Shadow delta | Grafana dashboard |
| Health cache keys | Redis `KEYS rental-health:*` count trend |

### 8.3 Manuell (Pilot Org)

| # | Check |
|---|-------|
| 1 | Fleet Command: critical tab count matches FHS |
| 2 | Vehicle with tire+battery warnings: both visible in detail |
| 3 | Ready drawer: vehicle with block not listed |
| 4 | Booking preflight: blocked vehicle cannot start |
| 5 | DRIVER: cannot PATCH tire spec |

### 8.4 Sign-Off

| Rolle | Verantwortung |
|-------|---------------|
| Engineering | Tests + shadow Δ=0 |
| Ops | Queue health + PM2 stable 24h |
| Legal (Phase 16) | GDPR erasure dry-run |
| Product | UX acceptance pilot org |

---

## 9. Deploy-Checkliste (Template pro Release)

```markdown
## Release: WP-XX — [title]
- [ ] Branch merged to main
- [ ] CI green
- [ ] Staging verified
- [ ] DB backup confirmed (prod deploy script)
- [ ] Feature flags documented (default off)
- [ ] Rollback steps documented
- [ ] Shadow mode configured (if applicable)
- [ ] Post-deploy health check
- [ ] 30min error log watch
- [ ] Shadow/metrics check (+24h)
```

---

## 10. Risiko-Register Deploy

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|-------------------|--------|------------|
| Deploy 502 window | Mittel (bewiesen) | Niedrig | Health gate; off-peak deploy |
| Battery queue failure recurrence | Mittel (bewiesen) | Mittel | WP-17 vor breiter SSOT |
| Blocking policy false positive | Mittel | **Hoch** | Shadow compare; instant flag rollback |
| Backfill lock contention | Niedrig | Mittel | Batching; off-peak |
| GDPR erasure mistake | Niedrig | **Hoch** | Dry-run; legal sign-off |
| PM2 restart storm | Niedrig | Mittel | Cumulative 3161 restarts bekannt; monitor |

---

## 11. Verweise

| Dokument | Inhalt |
|----------|--------|
| [`implementation-sequence.md`](./implementation-sequence.md) | Phasen 0–19 |
| [`test-strategy.md`](./test-strategy.md) | Abnahme-Tests |
| [`vehicle-warning-remediation-plan.md`](./vehicle-warning-remediation-plan.md) | Work Packages |
| [`../22-consolidated-findings.md`](../22-consolidated-findings.md) | Findings |
| `AGENTS.md` | VPS deploy flow |

---

**Changes / Architektur:** Nicht aktualisiert (Planung only).
