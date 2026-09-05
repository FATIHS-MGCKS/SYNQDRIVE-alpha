# Redis Observations — Vehicle Warnings Runtime (Prompt 23/26)

| Feld | Wert |
|------|------|
| **Audit-Zeit (UTC)** | 2026-07-25T17:53Z |
| **Instanz** | `127.0.0.1:6379` (localhost only) |
| **Modus** | `INFO`, `DBSIZE`, `SCAN`, `TTL`, `LLEN`/`ZCARD` — **keine** `GET`/`DEL` auf Secret-Keys |

---

## 1. Speicher & Eviction

| Metrik | Wert |
|--------|------|
| `used_memory_human` | 12.36M |
| `used_memory_peak_human` | 17.33M |
| `maxmemory_human` | 0B (unlimited) |
| `mem_fragmentation_ratio` | 1.89 |
| `evicted_keys` | **0** |
| `expired_keys` (lifetime counter) | 340 959 |

**Urteil:** Kein Memory-Pressure-Eviction; Speicher klein und stabil.

---

## 2. Keyspace

| Metrik | Wert |
|--------|------|
| `DBSIZE` | 1267 |
| `db0` | keys=1267, expires=21, avg_ttl≈35.8M ms |
| `keyspace_hits` | 9 252 476 |
| `keyspace_misses` | 10 456 243 |
| `instantaneous_ops_per_sec` | ~10 (Snapshot) |

**Cache-Verhalten:** Miss-Rate historisch höher als Hits — erwartbar bei TTL-Caches und BullMQ-Job-Turnover.

---

## 3. BullMQ

| Metrik | Wert |
|--------|------|
| Queues mit `:meta` | **19** |
| `bull:battery.v2:*` Keys (scan count) | 1032 |

Alle warnings-relevanten Queues: `wait=0`, `active=0` (siehe `queue-observations.md`).

---

## 4. Mandantenbezogene / Health-Cache-Keys

| Pattern | Count (Audit) | Anmerkung |
|---------|---------------|-----------|
| `rental-health-summary:*` | **0** | Kein warmer Cache zum Audit-Zeitpunkt |
| `fleet-map:*` | **0** | Kein warmer Cache zum Audit-Zeitpunkt |
| `synqdrive:*` (scan) | Prefix-Stichprobe leer in awk-Auswertung | Ggf. andere Prefix-Konvention aktiv |

**Interpretation:** Entweder kurze TTL abgelaufen, Cache-Feature deaktiviert, oder geringe Traffic-Phase — **kein** Cross-Tenant-Key-Leak beobachtet (keine Werte ausgelesen).

### Erwartetes Key-Format (Code-Referenz, nicht auf VPS verifiziert)

- `rental-health-summary:{organizationId}:{vehicleId}:v{N}`
- `fleet-map:{organizationId}:v1`
- `synqdrive:ai-chat:rate:{scope}:{keyId}:{bucket}`

---

## 5. Expirations / Cache-Alter

| Beobachtung | Wert |
|-------------|------|
| Keys mit TTL (`expires=21`) | Kleine Teilmenge von 1267 |
| Stichprobe `rental-health-summary` TTL | Keine Keys vorhanden |

---

## 6. Sicherheit

| Regel | Einhaltung |
|-------|------------|
| Keine Secret-Werte ausgegeben | **Ja** |
| Keine Keys gelöscht | **Ja** |
| Nur aggregierte/scoped Reads | **Ja** |

---

## 7. Risiken

| ID | Prio | Befund |
|----|------|--------|
| RT-R-P2 | **P2** | Health-Summary-Cache leer — mögliche DB-Last-Spitzen bei Fleet-Health-Reads |
| RT-R-INFO | Info | `maxmemory` unlimited — langfristig Wachstum überwachen |
