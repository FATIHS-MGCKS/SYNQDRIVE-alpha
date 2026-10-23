# PR #2135 — Abschluss-QA (Motion-Map)

**Geprüfte Version:** `a87234c87bf8138ce87e73f4c0f62a3e8858dc0d`  
**PR:** [#2135](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2135) (Draft, unverändert)  
**PR-HEAD-Verifikation (2026-10-23):** lokal, `origin/cursor/ds4-motion-speed-event-audit-192d` und GitHub-PR-HEAD identisch mit obigem SHA — **keine Abweichung**.

**Runtime-Basis (#2134):** `f95420593ecae98d54d1d3185476c66427d2aede` (unverändert)  
**CI (#2135 @ a87234c87):** 44 Checks — 42 SUCCESS, 2 SKIPPED, 0 failed (u. a. Typecheck, i18n-new-debt-gate, validate-module-registry).

## LIVE_QA

| Kriterium | Ergebnis | Nachweis |
|-----------|----------|----------|
| 1. Event-Highlight nur exaktes Segment (keine Nachbarsegmente) | **PASS (Proxy)** | `motion-map.utils.test.ts` (pinned Tiguan 19:04): Fenster 26–29 → genau 4 Samples; kein Extend. SVG/PNG aus produktivem `resolveMotionEventSegment` + `buildMotionEventSegmentFeatures` (siehe Artefakte). |
| 2. Start/Ende nur an Event-Label-Positionen | **PASS (Proxy)** | Tests: `start`/`end` nur bei exaktem Label-Timestamp; Endpunkte in Segment-Features nur bei `segment.start`/`segment.end`. |
| 3. Signiertes Δv symmetrisch gerundet; Anzeige + Ø-Beschleunigung gleiche Delta-Quelle | **PASS (Proxy)** | Tests: `formatSignedKmh` (±29.5→±30), `deriveMotionEventMetrics` nutzt persistiertes `deltaKmh` mit Vorzeichen aus Endpunkten; Popover-SSR `35 → 6 km/h (−29)`, `98 → 69 km/h (−30)`. |
| 4. G1/G2 nicht als Produktbewertung; `artefactSuspect` serverseitig | **PASS (Proxy)** | `TripMotionMapPopover.component.test.tsx`: implausible Beschleunigung ohne `artefactSuspect` → kein Artefakt-Text; mit `artefactSuspect: true` → Warnung. Kein `isMotionEventKinematicallyImplausible` in Popover/Marker-Pfad. |
| 5. Fahrtgrenzen und Datenlücken | **PASS (Proxy)** | Tests: Lücken (>1 s / fehlende Position) → `hasGaps`, mehrere `parts`; Popover segment notes bei `hasGaps` / fehlendem Segment. Accel 19:04:49–52 mit Lücke 19:04:50 → `hasGaps`, geteilte Linie (SVG). |
| **Live Mapbox / authentifizierte Trips-UI** | **NOT_RUN** | `VITE_MAPBOX_ACCESS_TOKEN` nicht gesetzt (Länge 0); keine Clerk-/Prod-Session in der Cloud-Agent-Umgebung. Echte Karten-Basemap und Trip-Detail-Navigation daher nicht manuell verifiziert. |

**Artefakte (Cloud Agent, HEAD a87234c87):**  
Pfad `/opt/cursor/artifacts/ds4-motion-speed-event-audit/pr2135-closing-qa-a87234c/` — Segment-SVG/PNG (Tiguan 19:04), Popover-PNGs (Bremsen, Beschleunigung ohne G1, server `artefactSuspect`), MapLibre-Limited-Harness (neutral, kein Mapbox-Produktionsbasemap).

**Automatisiert (dieser Lauf):**

- `motion-map.utils.test.ts` — 24 passed  
- `TripMotionMapPopover.component.test.tsx` — 7 passed  
- `compare_hardened.cjs` — bereits in `CORRECTION_VALIDATION.md` als PASS dokumentiert

## BASELINE_DEVIATIONS

Bezug: `CORRECTION_VALIDATION.md` (vier Failures bei breiter explorativer trips+i18n-Ausführung auf unverändertem `7932f0670`).

| Abweichung | Closing-QA-Nachprüfung |
|------------|-------------------------|
| `translation-coverage.test.ts` — 3 Failures (canonical-key Baseline-Drift 10431→10896, u. a. `countNewCanonicalKeysSinceBaseline` erwartet 0, erhält 465) | **Bestätigt auf Baseline:** identisch 3 failed / 4 passed auf `7932f0670` und `a87234c87`. |
| `trips-energy-timeline.test.tsx` — 1 Failure (recharge-time display expectation) | **In Closing QA nicht reproduziert:** 6/6 PASS isoliert und im kompletten `src/rental/components/trips/**`-Lauf auf **beiden** SHAs. Vierte Failure weiterhin nur über die in `CORRECTION_VALIDATION.md` dokumentierte **breitere** explorative Invocation belegt; bewusst nicht im PR-Scope behoben. |

**Fazit:** Mindestens **3 von 4** breiteren Test-Abweichungen sind unmittelbar als **pre-existing** auf der Korrektur-Baseline verifiziert; die vierte ist **dokumentarisch** auf derselben Baseline belegt, ohne Widerspruch zu den hier isoliert grünen Energy-Timeline-Läufen.

## Verbleibende Blocker

1. **Live Mapbox + authentifizierte Trip-Detail-QA** (NOT_RUN) — Token/Session.  
2. **Produkt-/Scope-Entscheidung:** Draft-Audit + Map-Prototyp; keine Detektor-Integration, kein Merge in Runtime #2134 ohne separates Release.  
3. **Bekannte Anzeige-/Daten-Themen (Audit, nicht durch diese QA geschlossen):** historisches Vorzeichen-Bug in Screenshots (+29 Bremsen), sparse-GPS-Events, unabhängige 19:04-Video-Referenz.

## MERGE_RECOMMENDATION

- **Draft beibehalten.** Kein Merge, kein Deploy (wie beauftragt).  
- **Technisch:** CI grün auf `a87234c87`; Korrekturpunkte 1–4 durch Unit-/Komponententests und Segment-Artefakte abgedeckt.  
- **Vor Ready-for-Review / Merge in `main`:** Live-QA mit Mapbox-Token und realer Tiguan-Trip-URL; optional Owner-Sign-off auf Audit-Scope vs. Produktions-Rollout.  
- **Empfehlung:** **Nicht mergen**, bis Live-QA PASS oder explizite Owner-Akzeptanz von NOT_RUN mit dokumentiertem Restrisiko.
