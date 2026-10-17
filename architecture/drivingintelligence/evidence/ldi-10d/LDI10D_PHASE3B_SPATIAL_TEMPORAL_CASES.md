# LDI-10D Phase 3B — Fallbeispiele

Anzahl: **6**

## CS_DECEL_CONFIRMED — Verzögerung

- Fenster: 2026-10-13T15:53:10Z → 2026-10-13T15:53:13Z
- Dauer: 3s
- Manöver: MANEUVER_DECELERATION_17
- OSM way: 35538144 | Junction: 416362308
- Klasse: **DECELERATION_APPROACH_CONFIRMED**
- Begründung: Manöverfenster mit überwiegend TRUSTED L3 und negativem Geschwindigkeitsgradient.
- Offen: Bremspedal/regen nicht beobachtbar; Signalphase UNKNOWN

## CS_ACCEL_QC_UNCLEAR — Beschleunigung + QC-Konflikt

- Fenster: 2026-10-13T15:53:14Z → 2026-10-13T15:53:19Z
- Dauer: 5s
- Manöver: MANEUVER_ACCELERATION_2
- OSM way: 35538144 | Junction: 416362308
- Klasse: **ACCELERATION_EXIT_UNKNOWN_ROAD**
- Begründung: UNCLEAR_QC_OR_GAPS Manöver; Straßenassoziation UNKNOWN trotz GPS.
- Offen: L3 QC Konflikt vs Karte unabhängig; Kein Ampelstatus

## CS_CURVE_CANDIDATE — Kurve

- Fenster: 2026-10-13T15:53:04Z → 2026-10-13T15:53:07Z
- Dauer: 3s
- Manöver: —
- OSM way: — | Junction: —
- Klasse: **CURVE_TRAVERSAL_CANDIDATE**
- Begründung: GPS-Richtungsänderung ohne Querbeschleunigungsmessung.
- Offen: OSM-Krümmung nicht metrisch verifiziert in 3B

## CS_JUNCTION_APPROACH — Kreuzungsannäherung

- Fenster: 2026-10-13T15:53:55Z → 2026-10-13T15:54:09Z
- Dauer: 0s
- Manöver: —
- OSM way: 1314429094 | Junction: 5607540141
- Klasse: **JUNCTION_APPROACH_CONFIRMED**
- Begründung: Bucket innerhalb 35 m eines CONFIRMED_TOPOLOGY-Knotens (Phase 2B).
- Offen: Kein Nachweis vollständigen Halt an Kreuzung; 114 ambiguous nodes excluded

## CS_ACCEL_PLAUSIBLE — Beschleunigung (PLAUSIBLE Kontrolle)

- Fenster: 2026-10-13T15:53:06Z → 2026-10-13T15:53:08Z
- Dauer: 2s
- Manöver: MANEUVER_ACCELERATION_1
- OSM way: 1208898810 | Junction: 2185728633
- Klasse: **ACCELERATION_EXIT_CONFIRMED**
- Begründung: PLAUSIBLE Manöver mit überwiegend TRUSTED QC — Kontrollgruppe zu UNCLEAR.
- Offen: Fahrstil-Score nicht abgeleitet; Kausalität Kreuzung UNKNOWN

## CS_ROW_ABSENT_GAP — Fehlende GPS-Buckets

- Fenster: 2026-10-13T15:53:00Z → 2026-10-13T15:53:00Z
- Dauer: 0s
- Manöver: —
- OSM way: — | Junction: —
- Klasse: **GAP_INTERRUPTED**
- Begründung: ROW_ABSENT — keine Interpolation, zeitliche Kontinuität unterbrochen.
- Offen: Ereignis in Lücke nicht rekonstruierbar
