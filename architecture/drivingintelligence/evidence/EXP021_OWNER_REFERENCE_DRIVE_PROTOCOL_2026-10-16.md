# EXP021 — Owner reference drive protocol (Speed QC / POSITION sparsity)

| Field | Value |
| --- | --- |
| Purpose | Repeatable **forward** measurement when historical gaps dominate; **does not** explain past outages |
| Suggested vehicle | **Volkswagen Tiguan**, Kennzeichen **WOB L 7503** (`19fedd4b-c4e8-4de8-a125-dab293326e7e`, DIMO token **192922**) — same identity as EXP021 gap case unless owner selects another verified fleet unit |
| Provider calls by agent | **0** (owner drives; platform captures via existing DIMO path after natural S4) |

## Before the drive

1. Confirm vehicle in SynqDrive matches **Kennzeichen / Fahrzeugname / DIMO-Verknüpfung** (screenshot or internal note).
2. Mount phone or action cam with **visible tachometer** (driver-safe: Beifahrer hält Kamera oder feste Halterung ohne Bedienung während der Fahrt).
3. Note **UTC** and **local (Europe/Berlin)** time from a trusted clock at:
   - **T0** — 2–5 min before engine start (standing).
   - **T1** — immediately after engine off at end.
4. Optional: second GNSS logger (phone app export). Record its clock offset vs UTC **separately**; do not assume sub-second sync.

## During the drive (normal operation only)

- Typical urban/rural mix: **Anfahren**, **konstantes Tempo** (z. B. 50/80/100 wo erlaubt), **normale Bremsungen**, **2–3 dokumentierte Stopps** (Ampel/Parkplatz) mit ungefährer Dauer.
- **Keine** riskanten Sondermanöver, kein absichtliches Ausreizen von GPS-Dead-Zones.
- For each stop: note **UTC (approx.)**, **Dauer**, **Standort grob** (Straße/Ort).

## After the drive

1. Wait for **natural S4 work-item completion** on that trip (no manual reprocessing unless ops runbook says so).
2. Record **trip id**, **WI id**, **pinned snapshot hash** from ops/evidence export (same fields as EXP021 forensics).
3. Secure **video file** + optional GNSS export; store SHA256 / filename in evidence ticket.

## What we will compare (pre-declared)

| Dimension | Treatment |
| --- | --- |
| POSITION during **confirmed movement** (video + tachometer) | Expect regular 1 s grid rows when provider path healthy; gaps here are **high signal** |
| POSITION during **confirmed standstill** | May legitimately sparse; **do not** score speed QC on those seconds |
| Speed error | Only on **time-aligned** segments where both video speed and QC intervals are assessable |
| Clock sync | Treat video UTC mapping as **± few seconds** unless calibrated; mark **non-assessable** border seconds |
| Historical gap (e.g. 2026-10-14) | **Out of scope** for causal closure — reference drive tests **recurrence** only |

## Success / failure (operator-facing)

- **Success:** New trip shows **no multi-minute POSITION `ROW_ABSENT` runs** during video-confirmed motion **or** documented connectivity episode explains absence.
- **Inconclusive:** Video/sync too weak to align seconds — repeat with better mount and T0/T1 sync.
- **Failure (pattern recurrence):** Multi-minute interior gaps during confirmed motion with no connectivity event — escalate as provider/ingest investigation (outside this protocol’s scope).

## Safety & compliance

- Fahrer bleibt ungestört; Video nur soweit zulässig (Datenschutz Mitfahrer, Straßenverkehrsrecht).
- Kein Produktions-Deploy oder Provider-Backfill als Teil dieses Protokolls.
