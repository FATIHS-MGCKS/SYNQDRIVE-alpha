# Auswertungen — Stärken- und Schwächen-Cockpit (Prompt 32/54)

## Ziel

Übersichtlicher **Management-Cockpit** für Unternehmensstärken, Schwächen und Verbesserungspotenziale — einheitlich kategorisiert, dedupliziert und nach erwarteter Wirkung sortiert.

## Darstellungskategorien

| Kategorie | Quelle |
|-----------|--------|
| **Stärke** | `EvaluationsDetectedStrength` |
| **Verbesserungspotenzial** | Schwäche `INFO` + `ESTIMATE`/`FORECAST` |
| **Beobachtung** | Schwäche `INFO` + `OBSERVATION` |
| **Risiko** | Schwäche `WARNING` |
| **Kritisches Risiko** | Schwäche `CRITICAL` |

Mapping und Sortierung: `shared/evaluations-insights/evaluations-sw-cockpit.ts`

## Eintrag (Karte)

Jede Finding-Karte (`EvaluationsSwFindingCard`) zeigt:

- **Titel** und kurze Erklärung
- **Quantitative Grundlage** (Improvement/Deviation-Label)
- **Vergleichsbasis** (i18n, keine Roh-Enums)
- **Zeitraum**
- **Betroffene Dimension** inkl. gruppierte Entitäten (Stationen/Fahrzeuge/Buchungen)
- **Finanzielle oder operative Auswirkung** (inkl. Schätzung/Prognose-Badge)
- **Confidence** als Text-Badge (nicht nur Farbe)
- **Datenabdeckung** mit Teilabdeckungs-Hinweis
- **Drill-down** → Detail-Drawer

**Severity** wird als Text-Badge (`Stärke`, `Risiko`, `Kritisches Risiko`, …) plus dezente Flächenfarbe dargestellt — nie nur Farbe.

## Detail-Drawer

`EvaluationsSwFindingDetailDrawer` (auf `DetailDrawer`):

- Übersicht (alle Metadaten)
- Begründung / Empfehlung
- Datenquellen (`underlyingKpis`)
- Betroffene Entitäten
- Ursachenanalyse (`driverAnalysis`: Primary/Secondary Factors, Disclaimer)
- Sprung zum passenden Seitenanker (Finanzen, Flotte, Risiken, …)

## Deduplizierung

1. **Backend** (bereits vorhanden): Regel-Dedupe in Strength/Weakness Detection
2. **Cockpit-Resolver** (neu): Cross-Source Root-Cause-Groups (z. B. `utilization`, `revenue`, `receivables`) — bei Konflikt Stärke vs. Schwäche gewinnt die höhere Dringlichkeit/Wirkung

## Sortierung

1. Kategorie-Rang (Kritisches Risiko → Stärke)
2. Finanzielle Wirkung (`impactScore`)
3. Dringlichkeit (`urgencyScore` / `priority`)
4. Confidence

## Filterkontext

Cockpit liest `summary.strengths` / `summary.weaknesses` aus der **bereits gefilterten** Analytics-Summary — kein separater API-Call.

Kategorie-Chips filtern clientseitig; Filterkontext der Seite bleibt erhalten.

## Empty States

| Grund | UI |
|-------|-----|
| Keine Findings | „Keine belastbaren Aussagen“ |
| Teilabdeckung beider Sektionen | „Unzureichende Datenlage“ |
| Section ERROR / UNAVAILABLE | Entsprechende Fehler-/Nicht-verfügbar-Meldung |

## Architektur

```
EvaluationsStrengthsWeaknessesSection
└── EvaluationsSwCockpit
    ├── resolveSwCockpit()  ← shared
    ├── Kategorie-Filter (Chips)
    ├── EvaluationsSwFindingCard × n
    └── EvaluationsSwFindingDetailDrawer
```

## Komponenten

| Datei | Rolle |
|-------|-------|
| `evaluations-sw-cockpit.contract.ts` | Unified Finding-Typen |
| `evaluations-sw-cockpit.ts` | Resolver, Dedupe, Sort |
| `EvaluationsSwCockpit.tsx` | Liste + Filter + Empty |
| `EvaluationsSwFindingCard.tsx` | Kartenzeile |
| `EvaluationsSwFindingDetailDrawer.tsx` | Detailansicht |

## Tests

| Ebene | Datei | Szenarien |
|-------|-------|-----------|
| Shared | `evaluations-sw-cockpit.spec.ts` | keine Findings, viele, gruppiert, Dedupe, Teilabdeckung, niedrige Confidence |
| UI | `EvaluationsSwCockpit.test.tsx` | Loading, Empty, viele Findings, Severity-Text, Keyboard-Tabs, Mobile snap |

```bash
cd backend && NODE_OPTIONS='--max-old-space-size=8192' npx jest evaluations-sw-cockpit.shared.spec.ts --runInBand
cd frontend && npm test -- EvaluationsSwCockpit
```

## i18n

Alle sichtbaren Texte unter `evaluations.swCockpit.*` (de/en).

## Screenshots

Nach Deploy / lokalem `npm run dev` unter **Auswertungen → Stärken & Schwächen**:

1. Cockpit mit gemischten Kategorien und Filter-Chips
2. Detail-Drawer mit Ursachenanalyse
3. Empty State bei unzureichender Datenlage
4. Mobile: horizontaler Filter-Scroll + volle Kartenbreite
