# Offline-Kandidaten (Ereignisebene) — Vergleich gegen Baseline

Code `main` @ `579ee8b2fed06593d7d2aa57cffb6036dbf53a24`. Baseline = Akzeptanzsicht §12 N3 (alles außer `ARTEFACT_SUSPECT`). B = Baseline, K = Kandidat. Klassen nach §5/§12; VERPASST-Zähler aus dem Orakelstatus der akzeptierten Teilmenge.

Kein Kandidat verändert C4, Schwellen, Guards oder die Ereignismenge; geprüft wird ausschließlich Akzeptanz bzw. `ARTEFACT_SUSPECT`-Markierung (§10 Kriterium 7, Paritäts-Assert im Skript).

## K-A — Akzeptanz nur bei Ereignisqualität OK

Ebene: Processor-Akzeptanz (eventAcceptedCount). Abgeleitet aus: TIG22, TES21-1, TES16. Unabhängige Fahrten: TES21-2. Vorausschau: 0 s.

| Fahrt | Rolle | akzeptiert B→K | harte FA B→K | weiche/Intens. FA B→K | TREFFER B→K | Fragmente B→K | VERPASST hart B→K | VERPASST grenzw. B→K | Median Beginn B→K | Median Ende B→K |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | EVAL | 20→16 | 0→0 | 0→0 | 12→12 | 0→0 | 1→1 | 4→4 | -1→-1 | -0.5→-0.5 |
| TES21-1 | DEV | 3→1 | 0→0 | 1→0 | 2→1 | 0→0 | 1→1 | 2→3 | 1→0 | 0.5→0 |
| TES21-2 | DEV | 4→4 | 0→0 | 0→0 | 4→4 | 0→0 | 0→0 | 3→3 | 2→2 | 2→2 |
| TES16 | EVAL | 17→16 | 0→0 | 0→0 | 15→15 | 1→0 | 0→0 | 3→3 | 1→1 | 0→0 |

Kriterien §10: 1 (harte FA ↓ auf EVAL, nirgends ↑): nicht erfüllt; 1 auf unabhängiger EVAL-Fahrt: nicht erfüllt; 2: erfüllt; 3: nicht erfüllt; 4: erfüllt; 5: erfüllt; 7: erfüllt (C4/Ereignismenge unverändert, Paritäts-Assert). **Ergebnis: NOT_PROVEN.**

Geänderte Akzeptanz gegenüber Baseline (Klasse = Baseline-Klassifikation, §5):

| Fahrt | Ereignis | km/h | Qualität (K) | Baseline-Klasse | Hinweis | unplausibel | Artefaktsicht | Grenznähe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | DECELERATION 19:04:26–19:04:29 (2026-10-22) | 34.7->5.5 | DEGRADED | UNVERIFIZIERBAR | AUSSERHALB_REFERENZFENSTER | 0 | 0 | 0 |
| TIG22 | ACCELERATION 19:04:34–19:04:38 (2026-10-22) | 5.5->100.1 | LIMITED | UNVERIFIZIERBAR | AUSSERHALB_REFERENZFENSTER | 1 | 0 | 1 |
| TIG22 | DECELERATION 19:04:39–19:04:42 (2026-10-22) | 98.2->68.6 | LIMITED | UNVERIFIZIERBAR | AUSSERHALB_REFERENZFENSTER | 0 | 0 | 1 |
| TIG22 | ACCELERATION 19:04:49–19:04:52 (2026-10-22) | 52.3->142.1 | DEGRADED | UNVERIFIZIERBAR | AUSSERHALB_REFERENZFENSTER | 1 | 0 | 1 |
| TES21-1 | DECELERATION 12:05:20–12:05:23 (2026-10-21) | 34->14.9 | DEGRADED | WEICHER_FEHLALARM |  | 0 | 0 | 0 |
| TES21-1 | DECELERATION 12:05:43–12:05:46 (2026-10-21) | 20.1->3.3 | LIMITED | TREFFER |  | 0 | 0 | 1 |
| TES16 | ACCELERATION 03:50:20–03:50:23 (2026-10-16) | 113.1->148.3 | DEGRADED | TREFFER_FRAGMENT |  | 0 | 1 | 0 |

## K-A2 — Akzeptanz ohne DEGRADED (JITTER_SUSPECT/REPAIRED im Ereignisfenster)

Ebene: Processor-Akzeptanz (eventAcceptedCount). Abgeleitet aus: TIG22, TES21-1, TES16. Unabhängige Fahrten: TES21-2. Vorausschau: 0 s.

| Fahrt | Rolle | akzeptiert B→K | harte FA B→K | weiche/Intens. FA B→K | TREFFER B→K | Fragmente B→K | VERPASST hart B→K | VERPASST grenzw. B→K | Median Beginn B→K | Median Ende B→K |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | EVAL | 20→18 | 0→0 | 0→0 | 12→12 | 0→0 | 1→1 | 4→4 | -1→-1 | -0.5→-0.5 |
| TES21-1 | DEV | 3→2 | 0→0 | 1→0 | 2→2 | 0→0 | 1→1 | 2→2 | 1→1 | 0.5→0.5 |
| TES21-2 | DEV | 4→4 | 0→0 | 0→0 | 4→4 | 0→0 | 0→0 | 3→3 | 2→2 | 2→2 |
| TES16 | EVAL | 17→16 | 0→0 | 0→0 | 15→15 | 1→0 | 0→0 | 3→3 | 1→1 | 0→0 |

Kriterien §10: 1 (harte FA ↓ auf EVAL, nirgends ↑): nicht erfüllt; 1 auf unabhängiger EVAL-Fahrt: nicht erfüllt; 2: erfüllt; 3: erfüllt; 4: erfüllt; 5: erfüllt; 7: erfüllt (C4/Ereignismenge unverändert, Paritäts-Assert). **Ergebnis: NOT_PROVEN.**

Geänderte Akzeptanz gegenüber Baseline (Klasse = Baseline-Klassifikation, §5):

| Fahrt | Ereignis | km/h | Qualität (K) | Baseline-Klasse | Hinweis | unplausibel | Artefaktsicht | Grenznähe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | DECELERATION 19:04:26–19:04:29 (2026-10-22) | 34.7->5.5 | DEGRADED | UNVERIFIZIERBAR | AUSSERHALB_REFERENZFENSTER | 0 | 0 | 0 |
| TIG22 | ACCELERATION 19:04:49–19:04:52 (2026-10-22) | 52.3->142.1 | DEGRADED | UNVERIFIZIERBAR | AUSSERHALB_REFERENZFENSTER | 1 | 0 | 1 |
| TES21-1 | DECELERATION 12:05:20–12:05:23 (2026-10-21) | 34->14.9 | DEGRADED | WEICHER_FEHLALARM |  | 0 | 0 | 0 |
| TES16 | ACCELERATION 03:50:20–03:50:23 (2026-10-16) | 113.1->148.3 | DEGRADED | TREFFER_FRAGMENT |  | 0 | 1 | 0 |

## K-B — K3-Erweiterung: Rückkehr auf Vor-Ereignis-Niveau (letzte nutzbare Probe vor Beginn)

Ebene: Detektor-Option (wie spikeReversionCheck), Fenster unverändert. Abgeleitet aus: TES16. Unabhängige Fahrten: TIG22, TES21-1, TES21-2. Vorausschau: 2 s.

| Fahrt | Rolle | akzeptiert B→K | harte FA B→K | weiche/Intens. FA B→K | TREFFER B→K | Fragmente B→K | VERPASST hart B→K | VERPASST grenzw. B→K | Median Beginn B→K | Median Ende B→K |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | EVAL | 20→20 | 0→0 | 0→0 | 12→12 | 0→0 | 1→1 | 4→4 | -1→-1 | -0.5→-0.5 |
| TES21-1 | DEV | 3→3 | 0→0 | 1→1 | 2→2 | 0→0 | 1→1 | 2→2 | 1→1 | 0.5→0.5 |
| TES21-2 | DEV | 4→4 | 0→0 | 0→0 | 4→4 | 0→0 | 0→0 | 3→3 | 2→2 | 2→2 |
| TES16 | EVAL | 17→16 | 0→0 | 0→0 | 15→15 | 1→0 | 0→0 | 3→3 | 1→1 | 0→0 |

Kriterien §10: 1 (harte FA ↓ auf EVAL, nirgends ↑): nicht erfüllt; 1 auf unabhängiger EVAL-Fahrt: nicht erfüllt; 2: erfüllt; 3: erfüllt; 4: erfüllt; 5: erfüllt; 7: erfüllt (C4/Ereignismenge unverändert, Paritäts-Assert). **Ergebnis: NOT_PROVEN.**

Geänderte Akzeptanz gegenüber Baseline (Klasse = Baseline-Klassifikation, §5):

| Fahrt | Ereignis | km/h | Qualität (K) | Baseline-Klasse | Hinweis | unplausibel | Artefaktsicht | Grenznähe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TES16 | ACCELERATION 03:50:20–03:50:23 (2026-10-16) | 113.1->148.3 | ARTEFACT_SUSPECT | TREFFER_FRAGMENT |  | 0 | 1 | 0 |

## K-C — Fahrzeugklassen-Plausibilitätsschranke (§8) → nicht akzeptiert

Ebene: Processor-Akzeptanz (benötigt Fahrzeugklasse). Abgeleitet aus: TIG22. Unabhängige Fahrten: TES21-1, TES21-2, TES16. Vorausschau: 0 s.

| Fahrt | Rolle | akzeptiert B→K | harte FA B→K | weiche/Intens. FA B→K | TREFFER B→K | Fragmente B→K | VERPASST hart B→K | VERPASST grenzw. B→K | Median Beginn B→K | Median Ende B→K |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | EVAL | 20→18 | 0→0 | 0→0 | 12→12 | 0→0 | 1→1 | 4→4 | -1→-1 | -0.5→-0.5 |
| TES21-1 | DEV | 3→3 | 0→0 | 1→1 | 2→2 | 0→0 | 1→1 | 2→2 | 1→1 | 0.5→0.5 |
| TES21-2 | DEV | 4→4 | 0→0 | 0→0 | 4→4 | 0→0 | 0→0 | 3→3 | 2→2 | 2→2 |
| TES16 | EVAL | 17→17 | 0→0 | 0→0 | 15→15 | 1→1 | 0→0 | 3→3 | 1→1 | 0→0 |

Kriterien §10: 1 (harte FA ↓ auf EVAL, nirgends ↑): nicht erfüllt; 1 auf unabhängiger EVAL-Fahrt: nicht erfüllt; 2: erfüllt; 3: erfüllt; 4: erfüllt; 5: erfüllt; 7: erfüllt (C4/Ereignismenge unverändert, Paritäts-Assert). **Ergebnis: NOT_PROVEN.**

Geänderte Akzeptanz gegenüber Baseline (Klasse = Baseline-Klassifikation, §5):

| Fahrt | Ereignis | km/h | Qualität (K) | Baseline-Klasse | Hinweis | unplausibel | Artefaktsicht | Grenznähe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | ACCELERATION 19:04:34–19:04:38 (2026-10-22) | 5.5->100.1 | LIMITED | UNVERIFIZIERBAR | AUSSERHALB_REFERENZFENSTER | 1 | 0 | 1 |
| TIG22 | ACCELERATION 19:04:49–19:04:52 (2026-10-22) | 52.3->142.1 | DEGRADED | UNVERIFIZIERBAR | AUSSERHALB_REFERENZFENSTER | 1 | 0 | 1 |
