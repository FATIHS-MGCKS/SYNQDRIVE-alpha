# Tabellen — DS4 Beschleunigen/Bremsen vs. Videoreferenz

Code `match2s` @ `a20641cc6d7e7908abd6514bcf8c191f08b03ead`; Detektorversion `HF_THRESHOLDS_V1_REUSED (trips/hf-acceleration.ts, trips/hf-braking.ts) + MOTION_CORE_EVENT_GUARDS_V0_1_DEV + MOTION_EVENT_V0_2_CAND_DEV[spikeReversionCheck]`; C4 `MOTION_CORE_SPEED_C4_V0_5_DEV`. Generiert 2026-10-23T12:49:55.077Z. Regeln: `EVALUATION_RULES.md` (inkl. §12 N1–N3). Alle Zeiten UTC, Referenz = Video-Tacho (1 Hz, ±1 s Ablesung, Uhrenversatz nicht validiert).

## 1. Fahrten

| Fahrt | Rolle | Fahrzeugklasse | Quelle | Referenzfenster (UTC) | lesbare s | C4 numerisch / nutzbar | Detektorsegmente | Quarantäne-s | DS4-Ereignisse (im Fenster) | akzeptiert | Orakel-Manöver | sichtbare Läufe |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | EVAL | TIGUAN | RUPTELA_R1 | 18:38:34–19:03:02 (2026-10-22) | 1417/1464 | 1908 / 1908 | 19 | 12 | 20 (12) | 20 | 18 | 45 |
| TES21-1 | DEV | TESLA | API_SYNTHETIC | 12:03:06–12:07:05 (2026-10-21) | 229/240 | 158 / 158 | 3 | 0 | 4 (4) | 3 | 5 | 17 |
| TES21-2 | DEV | TESLA | API_SYNTHETIC | 12:19:59–12:24:11 (2026-10-21) | 240/252 | 184 / 184 | 6 | 0 | 4 (4) | 4 | 9 | 19 |
| TES16 | EVAL | TESLA | API_SYNTHETIC | 03:36:00–03:54:55 (2026-10-16) | 973/1136 | 848 / 848 | 8 | 0 | 17 (17) | 17 | 18 | 45 |

## 2. Kennzahlen (gepoolt)

| Kennzahl | EVAL (TIG22+TES16) | DEV (TES21-1+2) | ALLE |
| --- | --- | --- | --- |
| DS4-Ereignisse gesamt | 37 | 8 | 45 |
| davon prüfbar (§5.1, N2) | 28 | 8 | 36 |
| TREFFER | 27 | 6 | 33 |
| TREFFER_FRAGMENT | 0 | 0 | 0 |
| FEHLALARM (hart) | 1 | 1 | 2 |
| WEICHER_FEHLALARM | 0 | 1 | 1 |
| FEHLALARM_INTENSITAET | 0 | 0 | 0 |
| FEHLALARM_UNBESTIMMT (N2) | 1 | 0 | 1 |
| UNVERIFIZIERBAR | 8 | 0 | 8 |
| harte FA / prüfbar | 0.036 | 0.125 | 0.056 |
| harte FA, strikte Zuordnung (N1) | 1 | 1 | 2 |
| Orakel-Manöver (T2) | 36 | 14 | 50 |
| ERKANNT | 27 | 6 | 33 |
| VERPASST (hart) | 1 | 1 | 2 |
| VERPASST_GRENZWERTIG | 7 | 5 | 12 |
| VERPASST_KEINE_DS4_GESCHWINDIGKEIT | 1 | 2 | 3 |
| Recall harte Manöver (Nenner) | 0.941 (17) | 0.667 (3) | 0.9 (20) |
| Beginn-Versatz Median [min..max] s | 0 [-2..5] | 2 [0..2] | 0 [-2..5] |
| Ende-Versatz Median [min..max] s | 0 [-1..3] | 1.5 [0..2] | 0 [-1..3] |
| Beginn innerhalb ±2 s | 0.93 | 1 | 0.94 |
| Δv-Abweichung zu Orakel: Bias / MAE / max km/h | -3.007 / 5.356 / 20.5 | -3.2 / 3.767 / 8.2 | -3.042 / 5.067 / 20.5 |
| sichtbare Läufe (T3): erkannt / verpasst oberhalb / unterhalb | 27 / 9 / 54 | 6 / 8 / 22 | 33 / 17 / 76 |

## 3. TIG22 — EVAL, TIGUAN, Trip `98d2a8e0-8b7d-4529-bf76-acee44d61fbe`

Qualitäten DS4: OK 16, DEGRADED 2, LIMITED 2. Grenznähe (§7, ≤ 2 s zu Segmentanfang/-ende/Quarantäne): 4 Ereignisse (TREFFER 1, UNVERIFIZIERBAR 3). Unplausibel (§8): 2. Artefaktsicht (N1): 0.

Produktionsparität: Lauf `15cdc8ae-35b5-44a1-9c91-2cd9120d1546` (2026-10-23T11:16:33.407468+00:00, Bundle DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1_LEG_GATE_OBD_POINT_AUTH_V4) — Replay identisch: **ja** (20 = 20 Ereignisse). Vor Deploy (DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1_FABLE_REVIEW_RECOMMENDED): 21 Ereignisse; nur vor Deploy: ACCELERATION|2026-10-22T18:49:12Z|2026-10-22T18:49:18Z; nur jetzt: –.

### TIG22 · Manövertabelle (T2-Orakel: derselbe Detektor auf der Referenzreihe)

| # | Art | UTC Beginn–Ende | Dauer s | Ref km/h | Δv | mittl. m/s² | Spitze 1 s | grenzw. | Status | DS4 Beginn–Ende | DS4 Δv | Versatz Beginn/Ende s | C4 unbrauchbar s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | BREMS | 18:40:56–18:40:58 | 2 | 17→6 | 11 | 1.528 | 1.667 | ja | VERPASST_KEINE_DS4_GESCHWINDIGKEIT | – | – | – | 3 |
| 2 | BESCHL | 18:41:11–18:41:13 | 2 | 2→15 | 13 | 1.806 | 1.944 | ja | VERPASST_GRENZWERTIG | – | – | – | 0 |
| 3 | BREMS | 18:42:56–18:42:58 | 2 | 14→3 | 11 | 1.528 | 1.667 | ja | VERPASST_GRENZWERTIG | – | – | – | 0 |
| 4 | BESCHL | 18:43:05–18:43:08 | 3 | 0→22 | 22 | 2.037 | 2.5 | nein | ERKANNT | 18:43:05–18:43:08 | 17.4 | 0 / 0 | 0 |
| 5 | BREMS | 18:43:58–18:44:01 | 3 | 34→12 | 22 | 2.037 | 2.5 | nein | ERKANNT | 18:43:58–18:44:02 | 22.4 | 0 / +1 | 0 |
| 6 | BESCHL | 18:44:16–18:44:18 | 2 | 0→15 | 15 | 2.083 | 2.5 | nein | VERPASST | – | – | – | 0 |
| 7 | BESCHL | 18:45:25–18:45:27 | 2 | 50→72 | 22 | 3.056 | 3.333 | nein | ERKANNT | 18:45:24–18:45:28 | 28.2 | -1 / +1 | 0 |
| 8 | BREMS | 18:46:44–18:46:46 | 2 | 63→50 | 13 | 1.806 | 1.944 | ja | ERKANNT | 18:46:44–18:46:46 | 10.6 | 0 / 0 | 0 |
| 9 | BESCHL | 18:47:00–18:47:04 | 4 | 50→85 | 35 | 2.431 | 2.778 | nein | ERKANNT | 18:47:00–18:47:04 | 31.4 | 0 / 0 | 0 |
| 10 | BREMS | 18:47:42–18:47:45 | 3 | 37→17 | 20 | 1.852 | 2.222 | nein | ERKANNT | 18:47:42–18:47:47 | 27.5 | 0 / +2 | 0 |
| 11 | BREMS | 18:58:17–18:58:21 | 4 | 44→9 | 35 | 2.431 | 2.778 | nein | ERKANNT | 18:58:16–18:58:20 | 31.1 | -1 / -1 | 0 |
| 12 | BESCHL | 18:58:23–18:58:26 | 3 | 8→27 | 19 | 1.759 | 1.944 | ja | ERKANNT | 18:58:22–18:58:25 | 16.5 | -1 / -1 | 0 |
| 13 | BREMS | 18:58:47–18:58:49 | 2 | 22→9 | 13 | 1.806 | 1.944 | ja | VERPASST_GRENZWERTIG | – | – | – | 0 |
| 14 | BESCHL | 18:59:01–18:59:05 | 4 | 4→49 | 45 | 3.125 | 4.722 | nein | ERKANNT | 18:59:00–18:59:04 | 38.6 | -1 / -1 | 0 |
| 15 | BESCHL | 18:59:28–18:59:30 | 2 | 41→61 | 20 | 2.778 | 3.056 | nein | ERKANNT | 18:59:27–18:59:29 | 17 | -1 / -1 | 0 |
| 16 | BREMS | 18:59:38–18:59:41 | 3 | 41→20 | 21 | 1.944 | 2.222 | nein | ERKANNT | 18:59:37–18:59:40 | 18.5 | -1 / -1 | 0 |
| 17 | BREMS | 19:00:00–19:00:02 | 2 | 22→8 | 14 | 1.944 | 2.222 | nein | ERKANNT | 18:59:59–19:00:01 | 12.7 | -1 / -1 | 0 |
| 18 | BREMS | 19:02:33–19:02:36 | 3 | 23→6 | 17 | 1.574 | 1.944 | ja | VERPASST_GRENZWERTIG | – | – | – | 0 |

### TIG22 · DS4-Ereignistabelle (Detektorausgabe, Baseline)

| # | Art | UTC Beginn–Ende | Dauer s | C4 km/h | Δv | mittl. m/s² | Spitze 1 s | Qualität | akz. | Klasse | Hinweis | Δv − Orakel | Δv-Fehler gleiches Fenster | unplaus. | Grenznähe | s seit Seg.-Anfang / bis Seg.-Ende | nächste Lücke s | Anteil nicht-OK | Artefaktsicht |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | BESCHL | 18:31:33–18:31:36 | 3 | 32.3→48.8 | 16.6 | 1.533 | 1.741 | OK | ja | UNVERIFIZIERBAR | AUSSERHALB_REFERENZFENSTER | – | – | nein | nein | 52 / 97 | 83 | 0 | nein |
| 2 | BREMS | 18:33:04–18:33:08 | 4 | 29→6.2 | 22.8 | 1.583 | 1.797 | OK | ja | UNVERIFIZIERBAR | AUSSERHALB_REFERENZFENSTER | – | – | nein | nein | 143 / 5 | 174 | 0 | nein |
| 3 | BESCHL | 18:33:49–18:33:51 | 2 | 5.5→16.5 | 11 | 1.528 | 1.749 | OK | ja | UNVERIFIZIERBAR | AUSSERHALB_REFERENZFENSTER | – | – | nein | nein | 7 / 285 | 219 | 0 | nein |
| 4 | BREMS | 18:38:25–18:38:30 | 5 | 33.3→5 | 28.3 | 1.575 | 1.934 | OK | ja | UNVERIFIZIERBAR | AUSSERHALB_REFERENZFENSTER | – | – | nein | nein | 283 / 6 | 147 | 0 | nein |
| 5 | BESCHL | 18:43:05–18:43:08 | 3 | 3.1→20.5 | 17.4 | 1.612 | 1.803 | OK | ja | TREFFER |  | -4.6 | -4.6 | nein | nein | 4 / 61 | 72 | 0 | nein |
| 6 | BREMS | 18:43:58–18:44:02 | 4 | 28.8→6.4 | 22.4 | 1.558 | 1.853 | OK | ja | TREFFER |  | 0.4 | -3.6 | nein | nein | 57 / 7 | 125 | 0 | nein |
| 7 | BESCHL | 18:45:24–18:45:28 | 4 | 44→72.2 | 28.2 | 1.957 | 2.419 | OK | ja | TREFFER |  | 6.2 | -1.8 | nein | nein | 68 / 141 | 211 | 0 | nein |
| 8 | BREMS | 18:46:44–18:46:46 | 2 | 58.2→47.6 | 10.6 | 1.479 | 1.643 | OK | ja | TREFFER |  | -2.4 | -2.4 | nein | nein | 148 / 63 | 291 | 0 | nein |
| 9 | BESCHL | 18:47:00–18:47:04 | 4 | 49.2→80.5 | 31.4 | 2.177 | 2.588 | OK | ja | TREFFER |  | -3.6 | -3.6 | nein | nein | 164 / 45 | 307 | 0 | nein |
| 10 | BREMS | 18:47:42–18:47:47 | 5 | 34.1→6.6 | 27.5 | 1.527 | 1.838 | OK | ja | TREFFER |  | 7.5 | -1.5 | nein | ja | 206 / 2 | 349 | 0 | nein |
| 11 | BREMS | 18:58:16–18:58:20 | 4 | 40.3→9.2 | 31.1 | 2.16 | 2.514 | OK | ja | TREFFER |  | -3.9 | 6.1 | nein | nein | 531 / 130 | 280 | 0 | nein |
| 12 | BESCHL | 18:58:22–18:58:25 | 3 | 8.5→25 | 16.5 | 1.53 | 1.627 | OK | ja | TREFFER |  | -2.5 | -0.5 | nein | nein | 537 / 125 | 275 | 0 | nein |
| 13 | BESCHL | 18:59:00–18:59:04 | 4 | 7.4→46 | 38.6 | 2.684 | 3.143 | OK | ja | TREFFER |  | -6.4 | -2.4 | nein | nein | 575 / 86 | 236 | 0 | nein |
| 14 | BESCHL | 18:59:27–18:59:29 | 2 | 40.4→57.5 | 17 | 2.367 | 2.446 | OK | ja | TREFFER |  | -3 | 5 | nein | nein | 602 / 61 | 211 | 0 | nein |
| 15 | BREMS | 18:59:37–18:59:40 | 3 | 37.6→19.1 | 18.5 | 1.712 | 1.906 | OK | ja | TREFFER |  | -2.5 | 0.5 | nein | nein | 612 / 50 | 200 | 0 | nein |
| 16 | BREMS | 18:59:59–19:00:01 | 2 | 19.6→6.9 | 12.7 | 1.769 | 1.801 | OK | ja | TREFFER |  | -1.3 | 1.7 | nein | nein | 634 / 29 | 179 | 0 | nein |
| 17 | BREMS | 19:04:26–19:04:29 | 3 | 34.7→5.5 | 29.2 | 2.703 | 3.836 | DEGRADED | ja | UNVERIFIZIERBAR | AUSSERHALB_REFERENZFENSTER | – | – | nein | nein | 5 / 23 | 1 | 0.5 | nein |
| 18 | BESCHL | 19:04:34–19:04:38 | 4 | 5.5→100.1 | 94.6 | 6.567 | 6.738 | LIMITED | ja | UNVERIFIZIERBAR | AUSSERHALB_REFERENZFENSTER | – | – | ja | ja | 13 / 14 | 0 | 1 | nein |
| 19 | BREMS | 19:04:39–19:04:42 | 3 | 98.2→68.6 | 29.5 | 2.736 | 3.101 | LIMITED | ja | UNVERIFIZIERBAR | AUSSERHALB_REFERENZFENSTER | – | – | nein | ja | 18 / 10 | 0 | 0.67 | nein |
| 20 | BESCHL | 19:04:49–19:04:52 | 3 | 52.3→142.1 | 89.8 | 8.313 | 10.849 | DEGRADED | ja | UNVERIFIZIERBAR | AUSSERHALB_REFERENZFENSTER | – | – | ja | ja | 28 / 0 | 0 | 1 | nein |

### TIG22 · T1 Operatorfenster (Analysefenster der Referenzaufnahme)

| # | Art | Clip | UTC Beginn–Ende | Dauer s | Ref km/h | mittl. Anzeige m/s² | Ref-Spitze 1 s | Orakel im Fenster | Status | DS4 Beginn–Ende | DS4 Δv | Versatz Beginn/Ende s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | BREMS | TC_00077.MOV | 18:40:48–18:41:01 | 13 | 38→0 | -0.8118 | 1.667 | 1 | VERPASST_OBERHALB_SCHWELLE | – | – | – |
| 2 | BREMS | TC_00078.MOV | 18:42:46–18:43:00 | 14 | 48→0 | -0.9523 | 1.667 | 1 | VERPASST_OBERHALB_SCHWELLE | – | – | – |
| 3 | BESCHL | TC_00080.MOV | 18:45:24–18:45:30 | 6 | 45→83 | 1.7593 | 3.333 | 1 | ERKANNT | 18:45:24–18:45:28 | 28.2 | 0 / -2 |
| 4 | BESCHL | TC_00080.MOV | 18:47:00–18:47:07 | 7 | 50→90 | 1.5873 | 2.778 | 1 | ERKANNT | 18:47:00–18:47:04 | 31.4 | 0 / -3 |
| 5 | BREMS | TC_00080.MOV | 18:47:30–18:47:50 | 20 | 76→0 | -1.0555 | 2.222 | 1 | ERKANNT | 18:47:42–18:47:47 | 27.5 | +12 / -3 |
| 6 | BREMS | TC_00084.MOV | 18:58:17–18:58:22 | 5 | 44→5 | -2.1667 | 2.778 | 1 | ERKANNT | 18:58:16–18:58:20 | 31.1 | -1 / -2 |
| 7 | BESCHL | TC_00084.MOV | 18:59:00–18:59:07 | 7 | 0→53 | 2.1032 | 4.722 | 1 | ERKANNT | 18:59:00–18:59:04 | 38.6 | 0 / -3 |
| 8 | BESCHL | TC_00084.MOV | 18:59:27–18:59:31 | 4 | 38→65 | 1.875 | 3.056 | 1 | ERKANNT | 18:59:27–18:59:29 | 17 | 0 / -2 |
| 9 | BREMS | TC_00084.MOV | 18:59:31–18:59:42 | 11 | 65→18 | -1.1867 | 2.222 | 1 | ERKANNT | 18:59:37–18:59:40 | 18.5 | +6 / -2 |

### TIG22 · T3 sichtbare monotone Läufe (|Δv| ≥ 10 km/h, ≥ 3 s)

45 Läufe: NICHT_ERWARTET_UNTERHALB_SCHWELLE 27, VERPASST_OBERHALB_SCHWELLE 6, ERKANNT 12.

Läufe mit Orakel oberhalb der Schwelle ohne DS4-Ereignis:

| Art | UTC Beginn–Ende | Ref km/h | Δv | mittl. m/s² | Spitze 1 s |
| --- | --- | --- | --- | --- | --- |
| BREMS | 18:40:35–18:41:01 | 54→0 | 54 | 0.577 | 1.667 |
| BESCHL | 18:41:10–18:41:34 | 0→49 | 49 | 0.567 | 1.944 |
| BREMS | 18:42:45–18:43:00 | 51→0 | 51 | 0.944 | 1.667 |
| BESCHL | 18:44:16–18:44:21 | 0→22 | 22 | 1.222 | 2.5 |
| BREMS | 18:58:42–18:58:53 | 27→0 | 27 | 0.682 | 1.944 |
| BREMS | 19:02:22–19:02:34 | 36→16 | 20 | 0.463 | 1.944 |

## 4. TES21-1 — DEV, TESLA, Trip `14c41c06-0a54-49d1-b5d2-f9d7373e638d`

Qualitäten DS4: DEGRADED 1, LIMITED 1, OK 1, ARTEFACT_SUSPECT 1. Grenznähe (§7, ≤ 2 s zu Segmentanfang/-ende/Quarantäne): 1 Ereignisse (TREFFER 1). Unplausibel (§8): 0. Artefaktsicht (N1): 0.

### TES21-1 · Manövertabelle (T2-Orakel: derselbe Detektor auf der Referenzreihe)

| # | Art | UTC Beginn–Ende | Dauer s | Ref km/h | Δv | mittl. m/s² | Spitze 1 s | grenzw. | Status | DS4 Beginn–Ende | DS4 Δv | Versatz Beginn/Ende s | C4 unbrauchbar s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | BESCHL | 12:04:40–12:04:42 | 2 | 23→42 | 19 | 2.639 | 3.333 | nein | VERPASST | – | – | – | 1 |
| 2 | BREMS | 12:05:41–12:05:45 | 4 | 29→4 | 25 | 1.736 | 1.944 | ja | ERKANNT | 12:05:43–12:05:46 | 16.8 | +2 / +1 | 2 |
| 3 | BESCHL | 12:05:55–12:05:59 | 4 | 12→37 | 25 | 1.736 | 1.944 | ja | VERPASST_GRENZWERTIG | – | – | – | 1 |
| 4 | BREMS | 12:06:03–12:06:05 | 2 | 34→20 | 14 | 1.944 | 1.944 | ja | ERKANNT | 12:06:03–12:06:05 | 12 | 0 / 0 | 0 |
| 5 | BESCHL | 12:06:09–12:06:13 | 4 | 12→38 | 26 | 1.806 | 1.944 | ja | VERPASST_GRENZWERTIG | – | – | – | 1 |

### TES21-1 · DS4-Ereignistabelle (Detektorausgabe, Baseline)

| # | Art | UTC Beginn–Ende | Dauer s | C4 km/h | Δv | mittl. m/s² | Spitze 1 s | Qualität | akz. | Klasse | Hinweis | Δv − Orakel | Δv-Fehler gleiches Fenster | unplaus. | Grenznähe | s seit Seg.-Anfang / bis Seg.-Ende | nächste Lücke s | Anteil nicht-OK | Artefaktsicht |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | BREMS | 12:05:20–12:05:23 | 3 | 34→14.9 | 19.1 | 1.771 | 1.774 | DEGRADED | ja | WEICHER_FEHLALARM |  | – | 9.1 | nein | nein | 93 / 23 | 0 | 1 | nein |
| 2 | BREMS | 12:05:43–12:05:46 | 3 | 20.1→3.3 | 16.8 | 1.559 | 1.69 | LIMITED | ja | TREFFER |  | -8.2 | 0.8 | nein | ja | 116 / 0 | 0 | 1 | nein |
| 3 | BREMS | 12:06:03–12:06:05 | 2 | 33.4→21.3 | 12 | 1.669 | 1.727 | OK | ja | TREFFER |  | -2 | -2 | nein | nein | 8 / 46 | 2 | 0 | nein |
| 4 | BESCHL | 12:06:26–12:06:28 | 2 | 43.8→56.2 | 12.4 | 1.725 | 2.044 | ARTEFACT_SUSPECT | nein | FEHLALARM |  | – | 12.4 | nein | nein | 31 / 23 | 1 | 0.67 | nein |

### TES21-1 · T3 sichtbare monotone Läufe (|Δv| ≥ 10 km/h, ≥ 3 s)

17 Läufe: NICHT_ERWARTET_UNTERHALB_SCHWELLE 11, VERPASST_OBERHALB_SCHWELLE 3, ERKANNT_UNTERHALB_SCHWELLE 1, ERKANNT 2.

Läufe mit Orakel oberhalb der Schwelle ohne DS4-Ereignis:

| Art | UTC Beginn–Ende | Ref km/h | Δv | mittl. m/s² | Spitze 1 s |
| --- | --- | --- | --- | --- | --- |
| BESCHL | 12:04:39–12:04:42 | 18→42 | 24 | 2.222 | 3.333 |
| BESCHL | 12:05:52–12:06:00 | 0→39 | 39 | 1.354 | 1.944 |
| BESCHL | 12:06:08–12:06:16 | 8→45 | 37 | 1.285 | 1.944 |

## 5. TES21-2 — DEV, TESLA, Trip `7a9d6a28-d91a-4919-98d8-d92fbea1573e`

Qualitäten DS4: OK 4. Grenznähe (§7, ≤ 2 s zu Segmentanfang/-ende/Quarantäne): 1 Ereignisse (TREFFER 1). Unplausibel (§8): 0. Artefaktsicht (N1): 0.

### TES21-2 · Manövertabelle (T2-Orakel: derselbe Detektor auf der Referenzreihe)

| # | Art | UTC Beginn–Ende | Dauer s | Ref km/h | Δv | mittl. m/s² | Spitze 1 s | grenzw. | Status | DS4 Beginn–Ende | DS4 Δv | Versatz Beginn/Ende s | C4 unbrauchbar s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | BREMS | 12:20:22–12:20:24 | 2 | 17→6 | 11 | 1.528 | 1.667 | ja | VERPASST_GRENZWERTIG | – | – | – | 1 |
| 2 | BREMS | 12:20:41–12:20:43 | 2 | 24→12 | 12 | 1.667 | 1.667 | ja | VERPASST_GRENZWERTIG | – | – | – | 0 |
| 3 | BESCHL | 12:20:47–12:20:49 | 2 | 21→33 | 12 | 1.667 | 1.667 | ja | ERKANNT | 12:20:49–12:20:51 | 12.4 | +2 / +2 | 0 |
| 4 | BESCHL | 12:22:13–12:22:16 | 3 | 6→28 | 22 | 2.037 | 2.222 | nein | VERPASST_KEINE_DS4_GESCHWINDIGKEIT | – | – | – | 2 |
| 5 | BESCHL | 12:22:40–12:22:43 | 3 | 17→49 | 32 | 2.963 | 3.333 | nein | ERKANNT | 12:22:42–12:22:45 | 27.9 | +2 / +2 | 0 |
| 6 | BREMS | 12:22:54–12:22:56 | 2 | 30→6 | 24 | 3.333 | 3.333 | nein | ERKANNT | 12:22:55–12:22:58 | 25.3 | +1 / +2 | 0 |
| 7 | BESCHL | 12:23:07–12:23:10 | 3 | 0→22 | 22 | 2.037 | 2.222 | nein | VERPASST_KEINE_DS4_GESCHWINDIGKEIT | – | – | – | 2 |
| 8 | BESCHL | 12:23:38–12:23:40 | 2 | 21→32 | 11 | 1.528 | 1.667 | ja | VERPASST_GRENZWERTIG | – | – | – | 0 |
| 9 | BREMS | 12:23:45–12:23:49 | 4 | 33→10 | 23 | 1.597 | 1.667 | ja | ERKANNT | 12:23:47–12:23:50 | 16.4 | +2 / +1 | 0 |

### TES21-2 · DS4-Ereignistabelle (Detektorausgabe, Baseline)

| # | Art | UTC Beginn–Ende | Dauer s | C4 km/h | Δv | mittl. m/s² | Spitze 1 s | Qualität | akz. | Klasse | Hinweis | Δv − Orakel | Δv-Fehler gleiches Fenster | unplaus. | Grenznähe | s seit Seg.-Anfang / bis Seg.-Ende | nächste Lücke s | Anteil nicht-OK | Artefaktsicht |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | BESCHL | 12:20:49–12:20:51 | 2 | 21.5→33.9 | 12.4 | 1.722 | 1.872 | OK | ja | TREFFER |  | 0.4 | 5.4 | nein | nein | 14 / 74 | 15 | 0 | nein |
| 2 | BESCHL | 12:22:42–12:22:45 | 3 | 20→47.9 | 27.9 | 2.584 | 3.14 | OK | ja | TREFFER |  | -4.1 | 14.9 | nein | nein | 27 / 13 | 15 | 0 | nein |
| 3 | BREMS | 12:22:55–12:22:58 | 3 | 30.5→5.2 | 25.3 | 2.345 | 2.949 | OK | ja | TREFFER |  | 1.3 | 8.3 | nein | ja | 40 / 0 | 2 | 0 | nein |
| 4 | BREMS | 12:23:47–12:23:50 | 3 | 26.1→9.7 | 16.4 | 1.516 | 1.665 | OK | ja | TREFFER |  | -6.6 | 3.4 | nein | nein | 17 / 3 | 13 | 0 | nein |

### TES21-2 · T3 sichtbare monotone Läufe (|Δv| ≥ 10 km/h, ≥ 3 s)

19 Läufe: NICHT_ERWARTET_UNTERHALB_SCHWELLE 10, VERPASST_OBERHALB_SCHWELLE 5, ERKANNT 4.

Läufe mit Orakel oberhalb der Schwelle ohne DS4-Ereignis:

| Art | UTC Beginn–Ende | Ref km/h | Δv | mittl. m/s² | Spitze 1 s |
| --- | --- | --- | --- | --- | --- |
| BREMS | 12:20:21–12:20:27 | 18→0 | 18 | 0.833 | 1.667 |
| BREMS | 12:20:39–12:20:43 | 29→12 | 17 | 1.181 | 1.667 |
| BESCHL | 12:22:11–12:22:21 | 0→41 | 41 | 1.139 | 2.222 |
| BESCHL | 12:23:07–12:23:11 | 0→24 | 24 | 1.667 | 2.222 |
| BESCHL | 12:23:36–12:23:42 | 12→36 | 24 | 1.111 | 1.667 |

## 6. TES16 — EVAL, TESLA, Trip `358d0158-b2a9-47ed-af26-33926c5770b4`

Qualitäten DS4: OK 16, DEGRADED 1. Grenznähe (§7, ≤ 2 s zu Segmentanfang/-ende/Quarantäne): 3 Ereignisse (TREFFER 3). Unplausibel (§8): 0. Artefaktsicht (N1): 0.

### TES16 · Manövertabelle (T2-Orakel: derselbe Detektor auf der Referenzreihe)

| # | Art | UTC Beginn–Ende | Dauer s | Ref km/h | Δv | mittl. m/s² | Spitze 1 s | grenzw. | Status | DS4 Beginn–Ende | DS4 Δv | Versatz Beginn/Ende s | C4 unbrauchbar s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | BESCHL | 03:39:06–03:39:08 | 2 | 21→32 | 11 | 1.528 | 1.667 | ja | VERPASST_GRENZWERTIG | – | – | – | 0 |
| 2 | BREMS | 03:39:43–03:39:46 | 3 | 28→6 | 22 | 2.037 | 2.778 | nein | ERKANNT | 03:39:41–03:39:47 | 34.9 | -2 / +1 | 0 |
| 3 | BESCHL | 03:39:48–03:39:55 | 7 | 4→40 | 36 | 1.429 | 1.667 | ja | ERKANNT | 03:39:52–03:39:55 | 15.5 | +4 / 0 | 0 |
| 4 | BREMS | 03:40:14–03:40:17 | 3 | 27→3 | 24 | 2.222 | 2.5 | nein | ERKANNT | 03:40:14–03:40:17 | 22 | 0 / 0 | 0 |
| 5 | BREMS | 03:41:42–03:41:48 | 6 | 56→3 | 53 | 2.454 | 2.778 | nein | ERKANNT | 03:41:42–03:41:48 | 50.3 | 0 / 0 | 0 |
| 6 | BESCHL | 03:42:30–03:42:35 | 5 | 5→35 | 30 | 1.667 | 1.944 | ja | VERPASST_GRENZWERTIG | – | – | – | 2 |
| 7 | BREMS | 03:42:41–03:42:45 | 4 | 33→10 | 23 | 1.597 | 1.667 | ja | ERKANNT | 03:42:42–03:42:45 | 17.1 | +1 / 0 | 0 |
| 8 | BESCHL | 03:42:57–03:43:01 | 4 | 0→24 | 24 | 1.667 | 1.944 | ja | VERPASST_GRENZWERTIG | – | – | – | 2 |
| 9 | BESCHL | 03:44:35–03:44:41 | 6 | 0→42 | 42 | 1.944 | 2.222 | nein | ERKANNT | 03:44:40–03:44:44 | 21.7 | +5 / +3 | 3 |
| 10 | BREMS | 03:45:42–03:45:49 | 7 | 44→5 | 39 | 1.548 | 1.944 | ja | ERKANNT | 03:45:43–03:45:49 | 31.8 | +1 / 0 | 0 |
| 11 | BESCHL | 03:45:56–03:45:59 | 3 | 18→38 | 20 | 1.852 | 1.944 | ja | ERKANNT | 03:45:56–03:46:00 | 24.7 | 0 / +1 | 0 |
| 12 | BESCHL | 03:46:57–03:47:00 | 3 | 51→68 | 17 | 1.574 | 1.667 | ja | ERKANNT | 03:46:58–03:47:00 | 11.1 | +1 / 0 | 0 |
| 13 | BREMS | 03:48:11–03:48:19 | 8 | 82→19 | 63 | 2.188 | 2.778 | nein | ERKANNT | 03:48:12–03:48:20 | 59.1 | +1 / +1 | 0 |
| 14 | BESCHL | 03:48:28–03:48:33 | 5 | 12→43 | 31 | 1.722 | 1.944 | ja | ERKANNT | 03:48:30–03:48:35 | 27.5 | +2 / +2 | 0 |
| 15 | BESCHL | 03:50:14–03:50:16 | 2 | 118→131 | 13 | 1.806 | 1.944 | ja | ERKANNT | 03:50:14–03:50:16 | 12 | 0 / 0 | 0 |
| 16 | BREMS | 03:52:22–03:52:28 | 6 | 107→69 | 38 | 1.759 | 2.222 | nein | ERKANNT | 03:52:23–03:52:28 | 30.7 | +1 / 0 | 0 |
| 17 | BREMS | 03:52:39–03:52:41 | 2 | 56→44 | 12 | 1.667 | 1.667 | ja | ERKANNT | 03:52:39–03:52:41 | 10.8 | 0 / 0 | 0 |
| 18 | BESCHL | 03:52:47–03:52:52 | 5 | 37→67 | 30 | 1.667 | 1.944 | ja | ERKANNT | 03:52:47–03:52:52 | 28.7 | 0 / 0 | 0 |

### TES16 · DS4-Ereignistabelle (Detektorausgabe, Baseline)

| # | Art | UTC Beginn–Ende | Dauer s | C4 km/h | Δv | mittl. m/s² | Spitze 1 s | Qualität | akz. | Klasse | Hinweis | Δv − Orakel | Δv-Fehler gleiches Fenster | unplaus. | Grenznähe | s seit Seg.-Anfang / bis Seg.-Ende | nächste Lücke s | Anteil nicht-OK | Artefaktsicht |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | BREMS | 03:39:41–03:39:47 | 6 | 38.1→3.3 | 34.9 | 1.614 | 2.144 | OK | ja | TREFFER |  | 12.9 | -2.1 | nein | nein | 78 / 30 | 32 | 0 | nein |
| 2 | BESCHL | 03:39:52–03:39:55 | 3 | 22.1→37.5 | 15.5 | 1.431 | 1.552 | OK | ja | TREFFER |  | -20.5 | 0.5 | nein | nein | 89 / 22 | 24 | 0 | nein |
| 3 | BREMS | 03:40:14–03:40:17 | 3 | 27.1→5.1 | 22 | 2.041 | 2.291 | OK | ja | TREFFER |  | -2 | -2 | nein | ja | 111 / 0 | 2 | 0 | nein |
| 4 | BESCHL | 03:41:00–03:41:03 | 3 | 33→52.2 | 19.3 | 1.782 | 1.887 | OK | ja | FEHLALARM_UNBESTIMMT | LESBARE_PAARE_1 | – | – | nein | nein | 8 / 45 | 10 | 0 | nein |
| 5 | BREMS | 03:41:42–03:41:48 | 6 | 55.1→4.8 | 50.3 | 2.328 | 2.67 | OK | ja | TREFFER |  | -2.7 | -2.7 | nein | ja | 50 / 0 | 2 | 0 | nein |
| 6 | BREMS | 03:42:42–03:42:45 | 3 | 28.4→11.3 | 17.1 | 1.581 | 1.637 | OK | ja | TREFFER |  | -5.9 | 0.1 | nein | nein | 10 / 3 | 4 | 0 | nein |
| 7 | BESCHL | 03:44:40–03:44:44 | 4 | 30.1→51.8 | 21.7 | 1.506 | 1.993 | OK | ja | TREFFER |  | -20.3 | – | nein | ja | 2 / 576 | 4 | 0 | nein |
| 8 | BREMS | 03:45:43–03:45:49 | 6 | 40→8.2 | 31.8 | 1.471 | 1.725 | OK | ja | TREFFER |  | -7.2 | -1.2 | nein | nein | 65 / 511 | 5 | 0 | nein |
| 9 | BESCHL | 03:45:56–03:46:00 | 4 | 13.5→38.2 | 24.7 | 1.714 | 2.054 | OK | ja | TREFFER |  | 4.7 | 0.7 | nein | nein | 78 / 500 | 2 | 0 | nein |
| 10 | BESCHL | 03:46:58–03:47:00 | 2 | 51.3→62.3 | 11.1 | 1.535 | 1.575 | OK | ja | TREFFER |  | -5.9 | 0.1 | nein | nein | 140 / 440 | 52 | 0 | nein |
| 11 | BREMS | 03:48:12–03:48:20 | 8 | 77.3→18.3 | 59.1 | 2.052 | 2.622 | OK | ja | TREFFER |  | -3.9 | 0.1 | nein | nein | 214 / 360 | 20 | 0 | nein |
| 12 | BESCHL | 03:48:30–03:48:35 | 5 | 19.2→46.7 | 27.5 | 1.528 | 1.741 | OK | ja | TREFFER |  | -3.5 | 0.5 | nein | nein | 232 / 345 | 27 | 0 | nein |
| 13 | BESCHL | 03:50:14–03:50:16 | 2 | 115.5→127.5 | 12 | 1.663 | 1.786 | OK | ja | TREFFER |  | -1 | -1 | nein | nein | 336 / 244 | 5 | 0 | nein |
| 14 | BESCHL | 03:50:20–03:50:23 | 3 | 113.1→148.3 | 35.2 | 3.258 | 5.593 | DEGRADED | ja | FEHLALARM |  | – | 36.2 | nein | nein | 342 / 237 | 0 | 1 | nein |
| 15 | BREMS | 03:52:23–03:52:28 | 5 | 97.3→66.6 | 30.7 | 1.708 | 1.953 | OK | ja | TREFFER |  | -7.3 | -1.3 | nein | nein | 465 / 112 | 38 | 0 | nein |
| 16 | BREMS | 03:52:39–03:52:41 | 2 | 53.7→42.9 | 10.8 | 1.499 | 1.566 | OK | ja | TREFFER |  | -1.2 | -1.2 | nein | nein | 481 / 99 | 54 | 0 | nein |
| 17 | BESCHL | 03:52:47–03:52:52 | 5 | 36.1→64.8 | 28.7 | 1.593 | 1.788 | OK | ja | TREFFER |  | -1.3 | -1.3 | nein | nein | 489 / 88 | 62 | 0 | nein |

### TES16 · T3 sichtbare monotone Läufe (|Δv| ≥ 10 km/h, ≥ 3 s)

45 Läufe: NICHT_ERWARTET_UNTERHALB_SCHWELLE 27, VERPASST_OBERHALB_SCHWELLE 3, ERKANNT 15.

Läufe mit Orakel oberhalb der Schwelle ohne DS4-Ereignis:

| Art | UTC Beginn–Ende | Ref km/h | Δv | mittl. m/s² | Spitze 1 s |
| --- | --- | --- | --- | --- | --- |
| BESCHL | 03:39:01–03:39:13 | 4→43 | 39 | 0.903 | 1.667 |
| BESCHL | 03:42:29–03:42:38 | 0→39 | 39 | 1.204 | 1.944 |
| BESCHL | 03:42:57–03:43:03 | 0→32 | 32 | 1.481 | 1.944 |
