
### Geschwindigkeit je Fahrt — Code `main` @ `dea2555bb` (Versatz 0 s, exakte Sekunde)

| Fahrt | Pfad | n gepaart / lesbar | Abdeckung | MAE | Median abs. Fehler | P95 abs. Fehler | max abs. Fehler | Bias | Anteil abs. Fehler ≤ 5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | L3 gespeichert | 1284 / 1417 | 90.6 % | 14.51 | 2.86 | 6.13 | 1904.9 | 8.93 | 90.0 % |
| TIG22 | L3 Replay | 1284 / 1417 | 90.6 % | 14.51 | 2.86 | 6.13 | 1904.9 | 8.93 | 90.0 % |
| TIG22 | L3 Replay nach Speed-QC V2 | 988 / 1417 | 69.7 % | 2.88 | 2.79 | 5.43 | 11.7 | -2.62 | 92.7 % |
| TIG22 | C4 gespeichert | 1372 / 1417 | 96.8 % | 9.22 | 2.78 | 6.04 | 1864.8 | 3.92 | 90.5 % |
| TIG22 | C4 Replay | 1372 / 1417 | 96.8 % | 9.22 | 2.78 | 6.04 | 1864.8 | 3.92 | 90.5 % |
| TIG22 | OBD (R1, Vergleichsquelle) | 449 / 1417 | 31.7 % | 21.48 | 14.00 | 61.00 | 84.0 | 2.94 | 29.6 % |
| TES21-1 | L3 gespeichert | 62 / 229 | 27.1 % | 2.81 | 1.28 | 14.99 | 20.0 | 0.57 | 85.5 % |
| TES21-1 | L3 Replay | 62 / 229 | 27.1 % | 2.81 | 1.28 | 14.99 | 20.0 | 0.57 | 85.5 % |
| TES21-1 | L3 Replay nach Speed-QC V2 | 61 / 229 | 26.6 % | 2.53 | 1.27 | 12.64 | 17.2 | 0.25 | 86.9 % |
| TES21-1 | C4 Replay | 150 / 229 | 65.5 % | 2.29 | 1.21 | 8.56 | 13.6 | -0.59 | 84.7 % |
| TES21-2 | L3 gespeichert | 169 / 240 | 70.4 % | 3.71 | 2.54 | 11.25 | 20.6 | -0.57 | 74.0 % |
| TES21-2 | L3 Replay | 169 / 240 | 70.4 % | 3.71 | 2.54 | 11.25 | 20.6 | -0.57 | 74.0 % |
| TES21-2 | L3 Replay nach Speed-QC V2 | 169 / 240 | 70.4 % | 3.71 | 2.54 | 11.25 | 20.6 | -0.57 | 74.0 % |
| TES21-2 | C4 Replay | 179 / 240 | 74.6 % | 3.60 | 2.32 | 10.95 | 20.6 | -0.62 | 74.9 % |
| TES16 | L3 gespeichert | 749 / 973 | 77.0 % | 2.38 | 2.14 | 4.49 | 59.4 | -1.99 | 97.9 % |
| TES16 | L3 Replay | 749 / 973 | 77.0 % | 2.38 | 2.14 | 4.49 | 59.4 | -1.99 | 97.9 % |
| TES16 | L3 Replay nach Speed-QC V2 | 748 / 973 | 76.9 % | 2.30 | 2.14 | 4.49 | 6.1 | -2.07 | 98.0 % |
| TES16 | C4 Replay | 808 / 973 | 83.0 % | 2.27 | 2.09 | 4.49 | 19.9 | -1.98 | 97.9 % |

### Gepoolt — Code `main`

| Pool | Pfad | n | MAE | Median abs. Fehler | P95 abs. Fehler | max abs. Fehler | Bias | Anteil abs. Fehler ≤ 5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| allDrives | L3 Replay | 2264 | 9.37 | 2.58 | 6.01 | 1904.9 | 4.38 | 91.3 % |
| allDrives | L3 Replay nach Speed-QC V2 | 1966 | 2.72 | 2.50 | 5.48 | 20.6 | -2.14 | 92.9 % |
| allDrives | C4 Replay | 2509 | 6.17 | 2.48 | 6.01 | 1864.8 | 1.43 | 91.4 % |
| allDrives | L3 gespeichert | 2264 | 9.37 | 2.58 | 6.01 | 1904.9 | 4.38 | 91.3 % |
| evalDrivesOnly_TIG22_TES16 | L3 Replay | 2033 | 10.04 | 2.62 | 5.48 | 1904.9 | 4.91 | 92.9 % |
| evalDrivesOnly_TIG22_TES16 | L3 Replay nach Speed-QC V2 | 1736 | 2.63 | 2.52 | 4.99 | 11.7 | -2.38 | 95.0 % |
| evalDrivesOnly_TIG22_TES16 | C4 Replay | 2180 | 6.65 | 2.54 | 5.42 | 1864.8 | 1.73 | 93.2 % |
| evalDrivesOnly_TIG22_TES16 | L3 gespeichert | 2033 | 10.04 | 2.62 | 5.48 | 1904.9 | 4.91 | 92.9 % |

### Physikalisch unplausible Schätzwerte (> 250 km/h) — getrennte Sicht, Code `main`

| Fahrt | Pfad | Sekunden > Schwelle | MAE ohne | P95 ohne | max ohne | Labels (UTC) |
| --- | --- | --- | --- | --- | --- | --- |
| TIG22 | L3 Replay | 11 | 2.99 | 5.90 | 14.4 | 18:49:13, 18:49:14, 18:49:15, 18:49:16, 18:49:17, 18:49:18, 18:49:19, 18:49:20, 18:49:21, 18:49:22, 18:49:23 |
| TIG22 | C4 Replay | 7 | 2.91 | 5.92 | 14.4 | 18:49:13, 18:49:14, 18:49:15, 18:49:16, 18:49:17, 18:49:18, 18:49:19 |
| TIG22 | L3 gespeichert | 11 | 2.99 | 5.90 | 14.4 | 18:49:13, 18:49:14, 18:49:15, 18:49:16, 18:49:17, 18:49:18, 18:49:19, 18:49:20, 18:49:21, 18:49:22, 18:49:23 |
| TIG22 | C4 gespeichert | 7 | 2.91 | 5.92 | 14.4 | 18:49:13, 18:49:14, 18:49:15, 18:49:16, 18:49:17, 18:49:18, 18:49:19 |

### Stillstand / Bewegung (Referenzkern) — Code `main`

| Fahrt | Pfad | Stillstand-Kern (s) | falsche Bewegung | kein Anspruch (still) | bestätigte Bewegung (s) | falscher Stillstand | kein Anspruch (bewegt) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | replay_l3 | 73 | 0 | 23 | 1254 | 0 | 12 |
| TIG22 | replay_c4 | 73 | 0 | 24 | 1254 | 0 | 14 |
| TIG22 | replay_fsm | 73 | 16 | 2 | 1254 | 0 | 0 |
| TIG22 | stored_l3 | 73 | 0 | 23 | 1254 | 0 | 12 |
| TIG22 | stored_c4 | 73 | 0 | 24 | 1254 | 0 | 14 |
| TIG22 | stored_fsm | 73 | 16 | 2 | 1254 | 0 | 0 |
| TIG22 | obd | 73 | 12 | 56 | 1254 | 12 | 859 |
| TES21-1 | replay_l3 | 8 | 0 | 8 | 160 | 0 | 107 |
| TES21-1 | replay_c4 | 8 | 0 | 8 | 160 | 0 | 46 |
| TES21-1 | replay_fsm | 8 | 0 | 4 | 160 | 2 | 8 |
| TES21-1 | stored_l3 | 8 | 0 | 8 | 160 | 0 | 107 |
| TES21-2 | replay_l3 | 15 | 0 | 15 | 170 | 0 | 17 |
| TES21-2 | replay_c4 | 15 | 0 | 15 | 170 | 0 | 13 |
| TES21-2 | replay_fsm | 15 | 0 | 2 | 170 | 5 | 7 |
| TES21-2 | stored_l3 | 15 | 0 | 15 | 170 | 0 | 17 |
| TES16 | replay_l3 | 116 | 0 | 116 | 739 | 0 | 23 |
| TES16 | replay_c4 | 116 | 0 | 116 | 739 | 0 | 9 |
| TES16 | replay_fsm | 116 | 0 | 0 | 739 | 2 | 0 |
| TES16 | stored_l3 | 116 | 0 | 116 | 739 | 0 | 23 |

### Zeitversatz Anhalten / Anfahren (DS4 − Referenz, s; positiv = spät) — Code `main`

| Fahrt | Pfad | Halte gefunden | Halt-Versätze | Median Halt | Anfahrten gefunden | Anfahr-Versätze | Median Anfahrt |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | replay_l3 | 7/7 | -7, -4, -3, -2, -1, -1, 3 | -2 | 4/5 | -1, 0, 0, 1 | 0 |
| TIG22 | replay_c4 | 7/7 | -7, -4, -3, -2, -1, 1, 5 | -2 | 5/5 | -1, -1, 0, 0, 10 | 0 |
| TIG22 | replay_fsm | 7/7 | -7, -4, -3, -2, -2, -1, 5 | -2 | 5/5 | -10, -9, -3, -1, 0 | -3 |
| TIG22 | stored_l3 | 7/7 | -7, -4, -3, -2, -1, -1, 3 | -2 | 4/5 | -1, 0, 0, 1 | 0 |
| TIG22 | stored_c4 | 7/7 | -7, -4, -3, -2, -1, 1, 5 | -2 | 5/5 | -1, -1, 0, 0, 10 | 0 |
| TIG22 | stored_fsm | 7/7 | -7, -4, -3, -2, -2, -1, 5 | -2 | 5/5 | -10, -9, -3, -1, 0 | -3 |
| TIG22 | obd | 3/7 | -4, -2, 2 | -2 | 3/3 | -9, 1, 1 | 1 |
| TES21-1 | replay_l3 | 0/1 | – | – | 0/0 | – | – |
| TES21-1 | replay_c4 | 0/1 | – | – | 0/0 | – | – |
| TES21-1 | replay_fsm | 1/1 | 0 | 0 | 1/1 | 2 | 2 |
| TES21-1 | stored_l3 | 0/1 | – | – | 0/0 | – | – |
| TES21-2 | replay_l3 | 1/3 | 6 | 6 | 1/1 | 8 | 8 |
| TES21-2 | replay_c4 | 1/3 | 6 | 6 | 1/1 | 7 | 7 |
| TES21-2 | replay_fsm | 3/3 | 0, 0, 1 | 0 | 3/3 | 3, 3, 7 | 3 |
| TES21-2 | stored_l3 | 1/3 | 6 | 6 | 1/1 | 8 | 8 |
| TES16 | replay_l3 | 1/4 | -2 | -2 | 0/0 | – | – |
| TES16 | replay_c4 | 2/4 | -2, -2 | -2 | 1/1 | 1 | 1 |
| TES16 | replay_fsm | 4/4 | -2, -2, -1, -1 | -1.5 | 3/3 | 1, 2, 2 | 2 |
| TES16 | stored_l3 | 0/4 | – | – | 0/0 | – | – |

### Sensitivität der Zeitzuordnung (C4 Replay; DS4-Lookup um k s verschoben; nur Einordnung) — Code `main`

| Fahrt | k = −2 | k = −1 | k = 0 (maßgeblich) | k = +1 | k = +2 |
| --- | --- | --- | --- | --- | --- |
| TIG22 | 9.60 / 8.08 | 9.07 / 5.60 | 9.22 / 6.04 | 9.88 / 9.18 | 10.67 / 13.16 |
| TES21-1 | 5.12 / 13.88 | 3.44 / 10.18 | 2.29 / 8.56 | 2.68 / 6.82 | 3.92 / 10.47 |
| TES21-2 | 7.33 / 19.52 | 5.63 / 15.41 | 3.60 / 10.95 | 1.70 / 4.98 | 1.85 / 5.73 |
| TES16 | 4.83 / 13.35 | 3.39 / 8.71 | 2.27 / 4.49 | 2.68 / 5.80 | 4.11 / 10.49 |

Zellen: MAE / P95 in km/h.

### Segmente (C4 Replay) — Code `main`

| Fahrt | Band | n | MAE | P95 abs. Fehler | Bias |
| --- | --- | --- | --- | --- | --- |
| TIG22 | ref_0 | 68 | 1.49 | 3.82 | 1.49 |
| TIG22 | ref_0_30 | 148 | 2.70 | 8.67 | -0.76 |
| TIG22 | ref_30_60 | 601 | 2.63 | 5.37 | -2.42 |
| TIG22 | ref_60_100 | 555 | 19.05 | 5.99 | 12.33 |
| TES21-1 | ref_0_30 | 104 | 1.95 | 7.88 | -0.25 |
| TES21-1 | ref_30_60 | 46 | 3.07 | 10.85 | -1.38 |
| TES21-2 | ref_0 | 1 | 4.45 | 4.45 | 4.45 |
| TES21-2 | ref_0_30 | 90 | 4.37 | 11.22 | 0.46 |
| TES21-2 | ref_30_60 | 88 | 2.81 | 9.07 | -1.78 |
| TES16 | ref_0_30 | 150 | 1.09 | 3.48 | -0.19 |
| TES16 | ref_30_60 | 215 | 1.71 | 4.51 | -1.46 |
| TES16 | ref_60_100 | 251 | 2.43 | 4.34 | -2.36 |
| TES16 | ref_100_plus | 192 | 3.62 | 4.58 | -3.45 |
| TIG22 | Phase STEADY | 943 | 9.20 | 5.33 | 3.65 |
| TIG22 | Phase CHANGING | 364 | 10.55 | 8.18 | 5.52 |
| TES21-1 | Phase STEADY | 64 | 2.00 | 8.71 | -0.00 |
| TES21-1 | Phase CHANGING | 71 | 2.68 | 7.76 | -1.29 |
| TES21-2 | Phase STEADY | 66 | 1.67 | 3.91 | -1.01 |
| TES21-2 | Phase CHANGING | 104 | 4.91 | 12.47 | -0.49 |
| TES16 | Phase STEADY | 422 | 2.27 | 4.02 | -2.15 |
| TES16 | Phase CHANGING | 348 | 2.26 | 4.84 | -1.75 |

### Dünne GPS-Stützung (C4 Replay, abs. Fehler nach Qualität / Nachbarschaftsmuster t−1 t t+1) — Code `main`

| Fahrt | Gruppe | n | MAE | P95 abs. Fehler | max abs. Fehler |
| --- | --- | --- | --- | --- | --- |
| TIG22 | Qualität JITTER_SUSPECT | 5 | 469.45 | 1221.37 | 1264.9 |
| TIG22 | Qualität OK | 1366 | 7.54 | 5.96 | 1864.8 |
| TIG22 | Qualität SPARSE_SUPPORT | 1 | 10.44 | 10.44 | 10.4 |
| TIG22 | Muster -PP | 1 | 10.68 | 10.68 | 10.7 |
| TIG22 | Muster PP- | 2 | 11.76 | 12.95 | 13.1 |
| TIG22 | Muster PPP | 1369 | 9.22 | 6.01 | 1864.8 |
| TES21-1 | Qualität JITTER_SUSPECT | 10 | 4.95 | 10.65 | 11.2 |
| TES21-1 | Qualität OK | 72 | 1.36 | 5.01 | 7.0 |
| TES21-1 | Qualität SPARSE_SUPPORT | 68 | 2.88 | 9.79 | 13.6 |
| TES21-1 | Muster -P- | 15 | 3.85 | 10.94 | 13.6 |
| TES21-1 | Muster -PP | 29 | 1.98 | 6.23 | 7.3 |
| TES21-1 | Muster PP- | 29 | 3.48 | 10.84 | 11.5 |
| TES21-1 | Muster PPP | 77 | 1.66 | 6.18 | 10.0 |
| TES21-2 | Qualität JITTER_SUSPECT | 5 | 2.38 | 5.25 | 6.1 |
| TES21-2 | Qualität OK | 171 | 3.62 | 11.19 | 20.6 |
| TES21-2 | Qualität SPARSE_SUPPORT | 3 | 5.01 | 5.64 | 5.7 |
| TES21-2 | Muster -PP | 3 | 3.86 | 5.64 | 5.7 |
| TES21-2 | Muster PP- | 2 | 3.01 | 4.31 | 4.5 |
| TES21-2 | Muster PPP | 174 | 3.61 | 11.10 | 20.6 |
| TES16 | Qualität JITTER_SUSPECT | 4 | 5.77 | 14.42 | 16.3 |
| TES16 | Qualität OK | 782 | 2.22 | 4.47 | 6.1 |
| TES16 | Qualität SPARSE_SUPPORT | 22 | 3.31 | 4.79 | 19.9 |
| TES16 | Muster -PP | 12 | 2.65 | 4.46 | 4.8 |
| TES16 | Muster PP- | 12 | 3.95 | 11.25 | 19.9 |
| TES16 | Muster PPP | 784 | 2.24 | 4.48 | 16.3 |

### Speed-QC (Produktpfad, DI_V0_SPEED_QC_POLICY_V2) auf lesbaren Referenzsekunden — Code `main`

| Fahrt | TRUSTED | TRUSTED_LIMITED | UNTRUSTED | davon mit numerischem L3 | Gründe (UNTRUSTED/LIMITED) |
| --- | --- | --- | --- | --- | --- |
| TIG22 | 988 | 37 | 392 | 296 | OK_STATIONARY_NULL_SPEED 37, NO_NUMERIC 55, SUPPORT_WINDOW_COMPROMISED 23, STATIONARY_INCONSISTENT 1, CROSS_SOURCE_CONFLICT 307, KINEMATIC_IMPLAUSIBLE_LEG 1, GEOMETRY_JUMP 5 |
| TES21-1 | 61 | 7 | 148 | 1 | NO_NUMERIC 147, OK_STATIONARY_NULL_SPEED 7, KINEMATIC_IMPLAUSIBLE_LEG 1 |
| TES21-2 | 169 | 2 | 55 | 0 | NO_NUMERIC 55, OK_STATIONARY_NULL_SPEED 2 |
| TES16 | 748 | 11 | 214 | 1 | NO_NUMERIC 213, OK_STATIONARY_NULL_SPEED 11, GEOMETRY_JUMP 1 |

### Gespeichert vs. Replay (Versionsdrift) und Ereignis-Vorzeichenprüfung — Code `main`

| Fahrt | L3 beide numerisch | L3 gleich (±0,05) | L3 nur gespeichert / nur Replay | C4 beide numerisch | C4 gleich | C4 nur gespeichert / nur Replay | Ereignisse Replay / gespeichert | deltaKmh ≥ 0 | deltaKmh = kind-signiert |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | 1756 | 1756 | 0 / 0 | 1916 | 1916 | 0 / 0 | 21 / 21 | 21/21 | 21/21 |
| TES21-1 | 67 | 67 | 0 / 0 | – | – | – | 4 / – | 4/4 | 4/4 |
| TES21-2 | 171 | 171 | 0 / 0 | – | – | – | 4 / – | 4/4 | 4/4 |
| TES16 | 776 | 776 | 0 / 0 | – | – | – | 17 / – | 17/17 | 17/17 |

### Geschwindigkeit je Fahrt — Code `pr2134` @ `f95420593` (Versatz 0 s, exakte Sekunde)

| Fahrt | Pfad | n gepaart / lesbar | Abdeckung | MAE | Median abs. Fehler | P95 abs. Fehler | max abs. Fehler | Bias | Anteil abs. Fehler ≤ 5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | L3 gespeichert | 1284 / 1417 | 90.6 % | 14.51 | 2.86 | 6.13 | 1904.9 | 8.93 | 90.0 % |
| TIG22 | L3 Replay | 1284 / 1417 | 90.6 % | 14.51 | 2.86 | 6.13 | 1904.9 | 8.93 | 90.0 % |
| TIG22 | L3 Replay nach Speed-QC V2 | 988 / 1417 | 69.7 % | 2.88 | 2.79 | 5.43 | 11.7 | -2.62 | 92.7 % |
| TIG22 | C4 gespeichert | 1372 / 1417 | 96.8 % | 9.22 | 2.78 | 6.04 | 1864.8 | 3.92 | 90.5 % |
| TIG22 | C4 Replay | 1364 / 1417 | 96.3 % | 2.90 | 2.77 | 5.92 | 14.4 | -2.42 | 90.9 % |
| TIG22 | OBD (R1, Vergleichsquelle) | 449 / 1417 | 31.7 % | 21.48 | 14.00 | 61.00 | 84.0 | 2.94 | 29.6 % |
| TES21-1 | L3 gespeichert | 62 / 229 | 27.1 % | 2.81 | 1.28 | 14.99 | 20.0 | 0.57 | 85.5 % |
| TES21-1 | L3 Replay | 62 / 229 | 27.1 % | 2.81 | 1.28 | 14.99 | 20.0 | 0.57 | 85.5 % |
| TES21-1 | L3 Replay nach Speed-QC V2 | 61 / 229 | 26.6 % | 2.53 | 1.27 | 12.64 | 17.2 | 0.25 | 86.9 % |
| TES21-1 | C4 Replay | 150 / 229 | 65.5 % | 2.29 | 1.21 | 8.56 | 13.6 | -0.59 | 84.7 % |
| TES21-2 | L3 gespeichert | 169 / 240 | 70.4 % | 3.71 | 2.54 | 11.25 | 20.6 | -0.57 | 74.0 % |
| TES21-2 | L3 Replay | 169 / 240 | 70.4 % | 3.71 | 2.54 | 11.25 | 20.6 | -0.57 | 74.0 % |
| TES21-2 | L3 Replay nach Speed-QC V2 | 169 / 240 | 70.4 % | 3.71 | 2.54 | 11.25 | 20.6 | -0.57 | 74.0 % |
| TES21-2 | C4 Replay | 179 / 240 | 74.6 % | 3.60 | 2.32 | 10.95 | 20.6 | -0.62 | 74.9 % |
| TES16 | L3 gespeichert | 749 / 973 | 77.0 % | 2.38 | 2.14 | 4.49 | 59.4 | -1.99 | 97.9 % |
| TES16 | L3 Replay | 749 / 973 | 77.0 % | 2.38 | 2.14 | 4.49 | 59.4 | -1.99 | 97.9 % |
| TES16 | L3 Replay nach Speed-QC V2 | 748 / 973 | 76.9 % | 2.30 | 2.14 | 4.49 | 6.1 | -2.07 | 98.0 % |
| TES16 | C4 Replay | 808 / 973 | 83.0 % | 2.27 | 2.09 | 4.49 | 19.9 | -1.98 | 97.9 % |

### Gepoolt — Code `pr2134`

| Pool | Pfad | n | MAE | Median abs. Fehler | P95 abs. Fehler | max abs. Fehler | Bias | Anteil abs. Fehler ≤ 5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| allDrives | L3 Replay | 2264 | 9.37 | 2.58 | 6.01 | 1904.9 | 4.38 | 91.3 % |
| allDrives | L3 Replay nach Speed-QC V2 | 1966 | 2.72 | 2.50 | 5.48 | 20.6 | -2.14 | 92.9 % |
| allDrives | C4 Replay | 2501 | 2.71 | 2.47 | 5.94 | 20.6 | -2.04 | 91.6 % |
| allDrives | L3 gespeichert | 2264 | 9.37 | 2.58 | 6.01 | 1904.9 | 4.38 | 91.3 % |
| evalDrivesOnly_TIG22_TES16 | L3 Replay | 2033 | 10.04 | 2.62 | 5.48 | 1904.9 | 4.91 | 92.9 % |
| evalDrivesOnly_TIG22_TES16 | L3 Replay nach Speed-QC V2 | 1736 | 2.63 | 2.52 | 4.99 | 11.7 | -2.38 | 95.0 % |
| evalDrivesOnly_TIG22_TES16 | C4 Replay | 2172 | 2.67 | 2.53 | 5.34 | 19.9 | -2.26 | 93.5 % |
| evalDrivesOnly_TIG22_TES16 | L3 gespeichert | 2033 | 10.04 | 2.62 | 5.48 | 1904.9 | 4.91 | 92.9 % |

### Physikalisch unplausible Schätzwerte (> 250 km/h) — getrennte Sicht, Code `pr2134`

| Fahrt | Pfad | Sekunden > Schwelle | MAE ohne | P95 ohne | max ohne | Labels (UTC) |
| --- | --- | --- | --- | --- | --- | --- |
| TIG22 | L3 Replay | 11 | 2.99 | 5.90 | 14.4 | 18:49:13, 18:49:14, 18:49:15, 18:49:16, 18:49:17, 18:49:18, 18:49:19, 18:49:20, 18:49:21, 18:49:22, 18:49:23 |
| TIG22 | L3 gespeichert | 11 | 2.99 | 5.90 | 14.4 | 18:49:13, 18:49:14, 18:49:15, 18:49:16, 18:49:17, 18:49:18, 18:49:19, 18:49:20, 18:49:21, 18:49:22, 18:49:23 |
| TIG22 | C4 gespeichert | 7 | 2.91 | 5.92 | 14.4 | 18:49:13, 18:49:14, 18:49:15, 18:49:16, 18:49:17, 18:49:18, 18:49:19 |

### Stillstand / Bewegung (Referenzkern) — Code `pr2134`

| Fahrt | Pfad | Stillstand-Kern (s) | falsche Bewegung | kein Anspruch (still) | bestätigte Bewegung (s) | falscher Stillstand | kein Anspruch (bewegt) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | replay_l3 | 73 | 0 | 23 | 1254 | 0 | 12 |
| TIG22 | replay_c4 | 73 | 0 | 24 | 1254 | 0 | 22 |
| TIG22 | replay_fsm | 73 | 0 | 4 | 1254 | 0 | 8 |
| TIG22 | stored_l3 | 73 | 0 | 23 | 1254 | 0 | 12 |
| TIG22 | stored_c4 | 73 | 0 | 24 | 1254 | 0 | 14 |
| TIG22 | stored_fsm | 73 | 16 | 2 | 1254 | 0 | 0 |
| TIG22 | obd | 73 | 12 | 56 | 1254 | 12 | 859 |
| TES21-1 | replay_l3 | 8 | 0 | 8 | 160 | 0 | 107 |
| TES21-1 | replay_c4 | 8 | 0 | 8 | 160 | 0 | 46 |
| TES21-1 | replay_fsm | 8 | 0 | 4 | 160 | 2 | 8 |
| TES21-1 | stored_l3 | 8 | 0 | 8 | 160 | 0 | 107 |
| TES21-2 | replay_l3 | 15 | 0 | 15 | 170 | 0 | 17 |
| TES21-2 | replay_c4 | 15 | 0 | 15 | 170 | 0 | 13 |
| TES21-2 | replay_fsm | 15 | 0 | 2 | 170 | 5 | 7 |
| TES21-2 | stored_l3 | 15 | 0 | 15 | 170 | 0 | 17 |
| TES16 | replay_l3 | 116 | 0 | 116 | 739 | 0 | 23 |
| TES16 | replay_c4 | 116 | 0 | 116 | 739 | 0 | 9 |
| TES16 | replay_fsm | 116 | 0 | 0 | 739 | 2 | 0 |
| TES16 | stored_l3 | 116 | 0 | 116 | 739 | 0 | 23 |

### Zeitversatz Anhalten / Anfahren (DS4 − Referenz, s; positiv = spät) — Code `pr2134`

| Fahrt | Pfad | Halte gefunden | Halt-Versätze | Median Halt | Anfahrten gefunden | Anfahr-Versätze | Median Anfahrt |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | replay_l3 | 7/7 | -7, -4, -3, -2, -1, -1, 3 | -2 | 4/5 | -1, 0, 0, 1 | 0 |
| TIG22 | replay_c4 | 7/7 | -7, -4, -3, -2, -1, 1, 5 | -2 | 5/5 | -1, -1, 0, 0, 10 | 0 |
| TIG22 | replay_fsm | 7/7 | -7, -4, -3, -2, -1, -1, 5 | -2 | 5/5 | -1, -1, 0, 0, 10 | 0 |
| TIG22 | stored_l3 | 7/7 | -7, -4, -3, -2, -1, -1, 3 | -2 | 4/5 | -1, 0, 0, 1 | 0 |
| TIG22 | stored_c4 | 7/7 | -7, -4, -3, -2, -1, 1, 5 | -2 | 5/5 | -1, -1, 0, 0, 10 | 0 |
| TIG22 | stored_fsm | 7/7 | -7, -4, -3, -2, -2, -1, 5 | -2 | 5/5 | -10, -9, -3, -1, 0 | -3 |
| TIG22 | obd | 3/7 | -4, -2, 2 | -2 | 3/3 | -9, 1, 1 | 1 |
| TES21-1 | replay_l3 | 0/1 | – | – | 0/0 | – | – |
| TES21-1 | replay_c4 | 0/1 | – | – | 0/0 | – | – |
| TES21-1 | replay_fsm | 1/1 | 0 | 0 | 1/1 | 2 | 2 |
| TES21-1 | stored_l3 | 0/1 | – | – | 0/0 | – | – |
| TES21-2 | replay_l3 | 1/3 | 6 | 6 | 1/1 | 8 | 8 |
| TES21-2 | replay_c4 | 1/3 | 6 | 6 | 1/1 | 7 | 7 |
| TES21-2 | replay_fsm | 3/3 | 0, 0, 1 | 0 | 3/3 | 3, 3, 7 | 3 |
| TES21-2 | stored_l3 | 1/3 | 6 | 6 | 1/1 | 8 | 8 |
| TES16 | replay_l3 | 1/4 | -2 | -2 | 0/0 | – | – |
| TES16 | replay_c4 | 2/4 | -2, -2 | -2 | 1/1 | 1 | 1 |
| TES16 | replay_fsm | 4/4 | -2, -2, -1, -1 | -1.5 | 3/3 | 1, 2, 2 | 2 |
| TES16 | stored_l3 | 0/4 | – | – | 0/0 | – | – |

### Sensitivität der Zeitzuordnung (C4 Replay; DS4-Lookup um k s verschoben; nur Einordnung) — Code `pr2134`

| Fahrt | k = −2 | k = −1 | k = 0 (maßgeblich) | k = +1 | k = +2 |
| --- | --- | --- | --- | --- | --- |
| TIG22 | 3.29 / 7.75 | 2.76 / 5.55 | 2.90 / 5.92 | 3.57 / 8.95 | 4.37 / 12.71 |
| TES21-1 | 5.12 / 13.88 | 3.44 / 10.18 | 2.29 / 8.56 | 2.68 / 6.82 | 3.92 / 10.47 |
| TES21-2 | 7.33 / 19.52 | 5.63 / 15.41 | 3.60 / 10.95 | 1.70 / 4.98 | 1.85 / 5.73 |
| TES16 | 4.83 / 13.35 | 3.39 / 8.71 | 2.27 / 4.49 | 2.68 / 5.80 | 4.11 / 10.49 |

Zellen: MAE / P95 in km/h.

### Segmente (C4 Replay) — Code `pr2134`

| Fahrt | Band | n | MAE | P95 abs. Fehler | Bias |
| --- | --- | --- | --- | --- | --- |
| TIG22 | ref_0 | 68 | 1.49 | 3.82 | 1.49 |
| TIG22 | ref_0_30 | 148 | 2.70 | 8.67 | -0.76 |
| TIG22 | ref_30_60 | 601 | 2.63 | 5.37 | -2.42 |
| TIG22 | ref_60_100 | 547 | 3.44 | 5.72 | -3.37 |
| TES21-1 | ref_0_30 | 104 | 1.95 | 7.88 | -0.25 |
| TES21-1 | ref_30_60 | 46 | 3.07 | 10.85 | -1.38 |
| TES21-2 | ref_0 | 1 | 4.45 | 4.45 | 4.45 |
| TES21-2 | ref_0_30 | 90 | 4.37 | 11.22 | 0.46 |
| TES21-2 | ref_30_60 | 88 | 2.81 | 9.07 | -1.78 |
| TES16 | ref_0_30 | 150 | 1.09 | 3.48 | -0.19 |
| TES16 | ref_30_60 | 215 | 1.71 | 4.51 | -1.46 |
| TES16 | ref_60_100 | 251 | 2.43 | 4.34 | -2.36 |
| TES16 | ref_100_plus | 192 | 3.62 | 4.58 | -3.45 |
| TIG22 | Phase STEADY | 937 | 2.89 | 5.28 | -2.69 |
| TIG22 | Phase CHANGING | 362 | 3.07 | 8.17 | -1.99 |
| TES21-1 | Phase STEADY | 64 | 2.00 | 8.71 | -0.00 |
| TES21-1 | Phase CHANGING | 71 | 2.68 | 7.76 | -1.29 |
| TES21-2 | Phase STEADY | 66 | 1.67 | 3.91 | -1.01 |
| TES21-2 | Phase CHANGING | 104 | 4.91 | 12.47 | -0.49 |
| TES16 | Phase STEADY | 422 | 2.27 | 4.02 | -2.15 |
| TES16 | Phase CHANGING | 348 | 2.26 | 4.84 | -1.75 |

### Dünne GPS-Stützung (C4 Replay, abs. Fehler nach Qualität / Nachbarschaftsmuster t−1 t t+1) — Code `pr2134`

| Fahrt | Gruppe | n | MAE | P95 abs. Fehler | max abs. Fehler |
| --- | --- | --- | --- | --- | --- |
| TIG22 | Qualität JITTER_SUSPECT | 3 | 11.72 | 12.91 | 13.1 |
| TIG22 | Qualität OK | 1360 | 2.88 | 5.73 | 14.4 |
| TIG22 | Qualität SPARSE_SUPPORT | 1 | 10.44 | 10.44 | 10.4 |
| TIG22 | Muster -PP | 1 | 10.68 | 10.68 | 10.7 |
| TIG22 | Muster PP- | 2 | 11.76 | 12.95 | 13.1 |
| TIG22 | Muster PPP | 1361 | 2.89 | 5.74 | 14.4 |
| TES21-1 | Qualität JITTER_SUSPECT | 10 | 4.95 | 10.65 | 11.2 |
| TES21-1 | Qualität OK | 72 | 1.36 | 5.01 | 7.0 |
| TES21-1 | Qualität SPARSE_SUPPORT | 68 | 2.88 | 9.79 | 13.6 |
| TES21-1 | Muster -P- | 15 | 3.85 | 10.94 | 13.6 |
| TES21-1 | Muster -PP | 29 | 1.98 | 6.23 | 7.3 |
| TES21-1 | Muster PP- | 29 | 3.48 | 10.84 | 11.5 |
| TES21-1 | Muster PPP | 77 | 1.66 | 6.18 | 10.0 |
| TES21-2 | Qualität JITTER_SUSPECT | 5 | 2.38 | 5.25 | 6.1 |
| TES21-2 | Qualität OK | 171 | 3.62 | 11.19 | 20.6 |
| TES21-2 | Qualität SPARSE_SUPPORT | 3 | 5.01 | 5.64 | 5.7 |
| TES21-2 | Muster -PP | 3 | 3.86 | 5.64 | 5.7 |
| TES21-2 | Muster PP- | 2 | 3.01 | 4.31 | 4.5 |
| TES21-2 | Muster PPP | 174 | 3.61 | 11.10 | 20.6 |
| TES16 | Qualität JITTER_SUSPECT | 4 | 5.77 | 14.42 | 16.3 |
| TES16 | Qualität OK | 782 | 2.22 | 4.47 | 6.1 |
| TES16 | Qualität SPARSE_SUPPORT | 22 | 3.31 | 4.79 | 19.9 |
| TES16 | Muster -PP | 12 | 2.65 | 4.46 | 4.8 |
| TES16 | Muster PP- | 12 | 3.95 | 11.25 | 19.9 |
| TES16 | Muster PPP | 784 | 2.24 | 4.48 | 16.3 |

### Speed-QC (Produktpfad, DI_V0_SPEED_QC_POLICY_V2) auf lesbaren Referenzsekunden — Code `pr2134`

| Fahrt | TRUSTED | TRUSTED_LIMITED | UNTRUSTED | davon mit numerischem L3 | Gründe (UNTRUSTED/LIMITED) |
| --- | --- | --- | --- | --- | --- |
| TIG22 | 988 | 37 | 392 | 296 | OK_STATIONARY_NULL_SPEED 37, NO_NUMERIC 55, SUPPORT_WINDOW_COMPROMISED 23, STATIONARY_INCONSISTENT 1, CROSS_SOURCE_CONFLICT 307, KINEMATIC_IMPLAUSIBLE_LEG 1, GEOMETRY_JUMP 5 |
| TES21-1 | 61 | 7 | 148 | 1 | NO_NUMERIC 147, OK_STATIONARY_NULL_SPEED 7, KINEMATIC_IMPLAUSIBLE_LEG 1 |
| TES21-2 | 169 | 2 | 55 | 0 | NO_NUMERIC 55, OK_STATIONARY_NULL_SPEED 2 |
| TES16 | 748 | 11 | 214 | 1 | NO_NUMERIC 213, OK_STATIONARY_NULL_SPEED 11, GEOMETRY_JUMP 1 |

### Gespeichert vs. Replay (Versionsdrift) und Ereignis-Vorzeichenprüfung — Code `pr2134`

| Fahrt | L3 beide numerisch | L3 gleich (±0,05) | L3 nur gespeichert / nur Replay | C4 beide numerisch | C4 gleich | C4 nur gespeichert / nur Replay | Ereignisse Replay / gespeichert | deltaKmh ≥ 0 | deltaKmh = kind-signiert |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | 1756 | 1756 | 0 / 0 | 1908 | 1908 | 8 / 0 | 20 / 21 | 20/20 | 20/20 |
| TES21-1 | 67 | 67 | 0 / 0 | – | – | – | 4 / – | 4/4 | 4/4 |
| TES21-2 | 171 | 171 | 0 / 0 | – | – | – | 4 / – | 4/4 | 4/4 |
| TES16 | 776 | 776 | 0 / 0 | – | – | – | 17 / – | 17/17 | 17/17 |

### Kandidat #2134 (`f95420593`) gegen Baseline main (`dea2555bb`) — gemeinsame Sekunden, Serie `replay_c4`

| Fahrt | Rolle | n gemeinsam | MAE Baseline → Kandidat | P95 Baseline → Kandidat | max Baseline → Kandidat | gepaart Baseline → Kandidat | zurückgehalten (unplausibel / plausibel) | FSM falsche Bewegung | FSM Anfahrt-Median | Ereignisse |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | EVAL (Kandidat hier abgeleitet) | 1364 | 2.90 → 2.90 | 5.92 → 5.92 | 14.4 → 14.4 | 1372 → 1364 | 7 / 1 | 16 → 0 | -3 → 0 | 21 → 20 |
| TES21-1 | DEV | 150 | 2.29 → 2.29 | 8.56 → 8.56 | 13.6 → 13.6 | 150 → 150 | 0 / 0 | 0 → 0 | 2 → 2 | 4 → 4 |
| TES21-2 | DEV | 179 | 3.60 → 3.60 | 10.95 → 10.95 | 20.6 → 20.6 | 179 → 179 | 0 / 0 | 0 → 0 | 3 → 3 | 4 → 4 |
| TES16 | EVAL | 808 | 2.27 → 2.27 | 4.49 → 4.49 | 19.9 → 19.9 | 808 → 808 | 0 / 0 | 0 → 0 | 2 → 2 | 17 → 17 |
