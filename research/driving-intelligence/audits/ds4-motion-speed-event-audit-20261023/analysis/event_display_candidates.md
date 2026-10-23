# Event-Display-Kandidaten (offline, nicht integriert)

Baseline reproduziert: Tiguan-22 21 Events / Tiguan-19 21 Events · Node v24.22.1 · 1319 ms · Heap Δ 19.5 MB · RSS 176.1 MB

| Kandidat | Tiguan-22 geflaggt (gesamt) | davon im Video | davon außerhalb | referenz-gematchte Events geflaggt | Tiguan-19 geflaggt |
|---|---|---|---|---|---|
| K-E (G1 ∪ G2) | 4/21 → #10, #17, #18, #20 | 1 | 3 | 0/7 | 0/21  |
| K-E3 (+G3) | 4/21 → #10, #17, #18, #20 | — | — | 0/7 | 0/21  |

## Tiguan-22 Events

| # | Art | UTC | km/h | Qualität | G1 | G2 | G3 | K-E |
|---|---|---|---|---|---|---|---|---|
| 0 | ACCEL | 18:31:33–18:31:36 | 32.3→48.8 | OK |  |  |  |  |
| 1 | DECEL | 18:33:04–18:33:08 | 29→6.2 | OK |  |  |  |  |
| 2 | ACCEL | 18:33:49–18:33:51 | 5.5→16.5 | OK |  |  |  |  |
| 3 | DECEL | 18:38:25–18:38:30 | 33.3→5 | OK |  |  |  |  |
| 4 | ACCEL | 18:43:05–18:43:08 | 3.1→20.5 | OK |  |  |  |  |
| 5 | DECEL | 18:43:58–18:44:02 | 28.8→6.4 | OK |  |  |  |  |
| 6 | ACCEL | 18:45:24–18:45:28 | 44→72.2 | OK |  |  |  |  |
| 7 | DECEL | 18:46:44–18:46:46 | 58.2→47.6 | OK |  |  |  |  |
| 8 | ACCEL | 18:47:00–18:47:04 | 49.2→80.5 | OK |  |  |  |  |
| 9 | DECEL | 18:47:42–18:47:47 | 34.1→6.6 | OK |  |  |  |  |
| 10 | ACCEL | 18:49:12–18:49:18 | 67.3→1930.8 | DEGRADED | mean 86.27 > 5 m/s²; endpoint > 250 km/h | JITTER_SUSPECT sample in window |  | **UNSICHER** |
| 11 | DECEL | 18:58:16–18:58:20 | 40.3→9.2 | OK |  |  |  |  |
| 12 | ACCEL | 18:58:22–18:58:25 | 8.5→25 | OK |  |  |  |  |
| 13 | ACCEL | 18:59:00–18:59:04 | 7.4→46 | OK |  |  |  |  |
| 14 | ACCEL | 18:59:27–18:59:29 | 40.4→57.5 | OK |  |  |  |  |
| 15 | DECEL | 18:59:37–18:59:40 | 37.6→19.1 | OK |  |  |  |  |
| 16 | DECEL | 18:59:59–19:00:01 | 19.6→6.9 | OK |  |  |  |  |
| 17 | DECEL | 19:04:26–19:04:29 | 34.7→5.5 | DEGRADED |  | JITTER_SUSPECT sample in window |  | **UNSICHER** |
| 18 | ACCEL | 19:04:34–19:04:38 | 5.5→100.1 | LIMITED | mean 6.57 > 5 m/s² |  |  | **UNSICHER** |
| 19 | DECEL | 19:04:39–19:04:42 | 98.2→68.6 | LIMITED |  |  |  |  |
| 20 | ACCEL | 19:04:49–19:04:52 | 52.3→142.1 | DEGRADED | mean 8.31 > 5 m/s² | JITTER_SUSPECT sample in window |  | **UNSICHER** |

## Referenzfenster (Video) — Erhaltung

| Fenster | Richtung | UTC | Referenz km/h | gematchte Events | durch K-E geflaggt |
|---|---|---|---|---|---|
| 1 | DECEL | 18:40:48–18:41:01 | 38→0 | — (kein Event) | keins |
| 2 | DECEL | 18:42:46–18:43:00 | 48→0 | — (kein Event) | keins |
| 3 | ACCEL | 18:45:24–18:45:30 | 45→83 | #6 | keins |
| 4 | ACCEL | 18:47:00–18:47:07 | 50→90 | #8 | keins |
| 5 | DECEL | 18:47:30–18:47:50 | 76→0 | #9 | keins |
| 6 | DECEL | 18:58:17–18:58:22 | 44→5 | #11 | keins |
| 7 | ACCEL | 18:59:00–18:59:07 | 0→53 | #13 | keins |
| 8 | ACCEL | 18:59:27–18:59:31 | 38→65 | #14 | keins |
| 9 | DECEL | 18:59:31–18:59:42 | 65→18 | #15 | keins |

## Robustheit (eingefrorene Pipeline)

- data_loss_yields_no_events: PASS events=0
- horizon_stability_10s: PASS full=17 truncated=17
- idempotent_rerun: PASS 
- gates_deterministic: PASS 
