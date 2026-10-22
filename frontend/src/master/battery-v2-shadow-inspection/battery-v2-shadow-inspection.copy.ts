/** Master Admin presentation island (C5B) — not product i18n Integration 2. */
const COPY: Record<string, string> = {
  'master.batteryV2Shadow.pageTitle': 'Battery V2 shadow inspection',
  'master.batteryV2Shadow.pageDescription':
    'Read-only Master Admin view over M3_3C_C5A_V1 — internal engineering inspection, not customer health UI (M3.3H).',
  'master.batteryV2Shadow.refreshAria': 'Refresh inspection',
  'master.batteryV2Shadow.targetSelection': 'Target selection',
  'master.batteryV2Shadow.organization': 'Organization',
  'master.batteryV2Shadow.selectOrganization': 'Select organization…',
  'master.batteryV2Shadow.vehicle': 'Vehicle',
  'master.batteryV2Shadow.filterVehiclePlaceholder': 'Filter plate / VIN / make…',
  'master.batteryV2Shadow.selectVehicle': 'Select vehicle…',
  'master.batteryV2Shadow.restSession': 'Rest session',
  'master.batteryV2Shadow.selectRestSession': 'Select rest session…',
  'master.batteryV2Shadow.emptyNoVehicleTitle': 'No vehicle selected',
  'master.batteryV2Shadow.emptyNoVehicleDescription':
    'Choose an organization and vehicle to load Battery V2 rest-session inspection data.',
  'master.batteryV2Shadow.emptyNoSessionTitle': 'No rest session selected',
  'master.batteryV2Shadow.emptyNoSessionsFound': 'No rest sessions found for this vehicle.',
  'master.batteryV2Shadow.emptySelectSession': 'Select a rest session to inspect.',
  'master.batteryV2Shadow.errorInspectionTitle': 'Inspection failed',
  'master.batteryV2Shadow.errorUnknown': 'Unknown error',
  'master.batteryV2Shadow.errorSessionsLoad': 'Rest sessions could not be loaded.',
  'master.batteryV2Shadow.errorInspectionRequest': 'Inspection request failed.',
  'master.batteryV2Shadow.integrityPrefix': 'Integrity:',
  'master.batteryV2Shadow.sessionIdentity': 'Session identity',
  'master.batteryV2Shadow.canonicalState': 'Canonical state',
  'master.batteryV2Shadow.canonicalFeatureTitle': 'Canonical feature (C5A)',
  'master.batteryV2Shadow.chargeContextTitle': 'Charge context (canonical, C5A raw)',
  'master.batteryV2Shadow.revisionHistoryTitle': 'Revision history (visible window: {{count}})',
  'master.batteryV2Shadow.digestIntegrityTitle': 'Digest / revision integrity',
  'master.batteryV2Shadow.metric.vehicle': 'Vehicle',
  'master.batteryV2Shadow.metric.sessionStatus': 'Session status',
  'master.batteryV2Shadow.metric.anchor': 'Anchor',
  'master.batteryV2Shadow.metric.endReason': 'End reason',
  'master.batteryV2Shadow.metric.restObservations': 'Rest observations',
  'master.batteryV2Shadow.metric.sessionId': 'Session id',
  'master.batteryV2Shadow.metric.canonicalRevision': 'Canonical revision',
  'master.batteryV2Shadow.metric.canonicalRowId': 'Canonical row id',
  'master.batteryV2Shadow.metric.selection': 'Selection',
  'master.batteryV2Shadow.metric.latestSemanticRev': 'Latest semantic rev',
  'master.batteryV2Shadow.metric.totalFeatureRows': 'Total feature rows',
  'master.batteryV2Shadow.metric.windowTruncated': 'Window truncated',
  'master.batteryV2Shadow.metric.countAggregateConsistent': 'Count/aggregate consistent',
  'master.batteryV2Shadow.metric.shutdownRestDelta': 'Shutdown → first rest Δ',
  'master.batteryV2Shadow.metric.theilSenSlope': 'Theil-Sen slope',
  'master.batteryV2Shadow.metric.medianRestV': 'Median rest V',
  'master.batteryV2Shadow.metric.validRestPoints': 'Valid rest points',
  'master.batteryV2Shadow.metric.minRestV': 'Min rest V',
  'master.batteryV2Shadow.metric.maxRestV': 'Max rest V',
  'master.batteryV2Shadow.metric.variance': 'Variance mV²',
  'master.batteryV2Shadow.metric.missingRungs': 'Missing rungs',
  'master.batteryV2Shadow.metric.chargeClass': 'Charge class',
  'master.batteryV2Shadow.metric.observationSpan': 'Observation span',
  'master.batteryV2Shadow.metric.semanticGaps': 'Semantic gaps',
  'master.batteryV2Shadow.metric.duplicateRevisions': 'Duplicate revisions',
  'master.batteryV2Shadow.metric.uncheckedRows': 'Unchecked rows',
  'master.batteryV2Shadow.metric.versionTuple': 'Version tuple',
  'master.batteryV2Shadow.retentionCurveNote':
    'Retention curve points (from C5A inputSummary): {{count}} eligible retention point(s) — values not recomputed in UI.',
  'master.batteryV2Shadow.retentionSectionTitle': 'Retention curve (C5A inputSummary.retentionPoints)',
  'master.batteryV2Shadow.retentionEmpty': 'No retention points in C5A inputSummary for this revision.',
  'master.batteryV2Shadow.retentionCol.index': '#',
  'master.batteryV2Shadow.retentionCol.observation': 'Observation',
  'master.batteryV2Shadow.retentionCol.restAge': 'actualRestAgeMs',
  'master.batteryV2Shadow.retentionCol.voltage': 'voltageMv',
  'master.batteryV2Shadow.retentionCol.rung': 'nominalRung',
  'master.batteryV2Shadow.retentionCol.evidence': 'evidenceClass',
  'master.batteryV2Shadow.table.rev': 'Rev',
  'master.batteryV2Shadow.table.phase': 'Phase',
  'master.batteryV2Shadow.table.trust': 'Trust',
  'master.batteryV2Shadow.table.digest': 'Digest',
  'master.batteryV2Shadow.table.slope': 'Slope',
  'master.batteryV2Shadow.table.canonical': 'Canonical',
  'master.batteryV2Shadow.yesLatest100': 'yes (latest 100)',
  'master.batteryV2Shadow.yes': 'yes',
  'master.batteryV2Shadow.no': 'no',
  'master.batteryV2Shadow.canonicalTag': 'canonical',
  'master.batteryV2Shadow.digestValid': 'valid',
  'master.batteryV2Shadow.digestMismatch': 'MISMATCH',
  'master.batteryV2Shadow.lvMeasured.boundaryTitle': 'LV measured intelligence (G5C-N13)',
  'master.batteryV2Shadow.lvMeasured.boundaryBody':
    'MEASURED = stored LV voltage observations. DERIVED = C3/D3 features from those series. No SOH %, no GOOD/BAD labels, no customer publication.',
  'master.batteryV2Shadow.lvMeasured.latestTitle': 'Latest measured LV',
  'master.batteryV2Shadow.lvMeasured.noMeasurements': 'No stored LV generalized-evidence voltage rows for this vehicle.',
  'master.batteryV2Shadow.lvMeasured.vehicleTimelineTitle': 'Vehicle voltage timeline (deduped MEASURED)',
  'master.batteryV2Shadow.lvMeasured.truncatedHistory': 'Historical window truncated at server limit — older points omitted.',
  'master.batteryV2Shadow.lvMeasured.sessionTitle': 'Selected REST session — measured rest-hours curve',
  'master.batteryV2Shadow.lvMeasured.noSessionPoints': 'No deduped measured points linked to this session.',
  'master.batteryV2Shadow.lvMeasured.d4Title': 'D3 / D4 longitudinal summary (bounded)',
  'master.batteryV2Shadow.lvMeasured.episodeCompareTitle': 'REST episode comparison (MEASURED vs DERIVED summary)',
  'master.batteryV2Shadow.lvMeasured.loadError': 'LV measured intelligence could not be loaded.',
  'master.batteryV2Shadow.lvMeasured.provenanceFooter':
    'NOT_ASSESSED · publication OFF · E3 inactive · F6 OFF · dedup: {{deduplicationPolicy}}',
  'master.batteryV2Shadow.lvMeasured.metric.measuredV': 'MEASURED V',
  'master.batteryV2Shadow.lvMeasured.metric.providerTime': 'Provider time',
  'master.batteryV2Shadow.lvMeasured.metric.context': 'Context',
  'master.batteryV2Shadow.lvMeasured.metric.openProviderGaps': 'Open provider gaps',
  'master.batteryV2Shadow.lvMeasured.metric.derivedMedian': 'DERIVED median',
  'master.batteryV2Shadow.lvMeasured.metric.derivedSlope': 'DERIVED slope',
  'master.batteryV2Shadow.lvMeasured.metric.minMax': 'Min / max',
  'master.batteryV2Shadow.lvMeasured.metric.c3RetentionPts': 'C3 retention pts',
  'master.batteryV2Shadow.lvMeasured.chart.restHoursAxis': 'Rest hours',
  'master.batteryV2Shadow.lvMeasured.tooltip.measuredSeries': 'MEASURED',
  'master.batteryV2Shadow.lvMeasured.contextLimitedPrefix': 'CONTEXT_LIMITED:',
  'master.batteryV2Shadow.lvMeasured.d4AckCount':
    ' · ACK count on latest revision: {{count}} (not full D4 verification)',
  'master.batteryV2Shadow.lvMeasured.d4AckUnavailable': ' · ACK unavailable',
  'master.batteryV2Shadow.lvMeasured.table.opened': 'Opened',
  'master.batteryV2Shadow.lvMeasured.table.status': 'Status',
  'master.batteryV2Shadow.lvMeasured.table.measuredPts': 'MEASURED pts',
  'master.batteryV2Shadow.lvMeasured.historyRangeTitle': 'Historical MEASURED window',
  'master.batteryV2Shadow.lvMeasured.historyFrom': 'From (local time)',
  'master.batteryV2Shadow.lvMeasured.historyTo': 'To (local time)',
  'master.batteryV2Shadow.lvMeasured.historyApply': 'Load range',
  'master.batteryV2Shadow.lvMeasured.historyRecentLimit': 'Recent limit',
  'master.batteryV2Shadow.lvMeasured.historyModeRecent':
    'Default: newest MEASURED points first (server cap 500). Chart focuses on the returned window — not synthetic interpolation.',
  'master.batteryV2Shadow.lvMeasured.historyModeRange':
    'Custom local date range (ascending MEASURED, deduped). If the server limit is hit, the oldest points in the range are returned first — narrow the range or use Recent limit for the latest data.',
  'master.batteryV2Shadow.lvMeasured.historyWindowLabel': 'Loaded window: {{from}} → {{to}} ({{count}} chart points)',
  'master.batteryV2Shadow.lvMeasured.truncatedHistoryRange':
    'Server observation limit reached inside this date range — chart may omit the newest measurements in the range. Use Recent limit or a shorter range.',
  'master.batteryV2Shadow.lvMeasured.chart.empty': 'No MEASURED voltage points in the loaded window.',
  'master.batteryV2Shadow.lvMeasured.chart.singlePoint':
    'Only one MEASURED point in this window — shown as a marker (no interpolated curve).',
  'master.batteryV2Shadow.lvMeasured.chart.gapBreaks':
    '{{count}} measurement gap(s) — line is not drawn across long silent intervals.',
  'master.batteryV2Shadow.lvMeasured.tooltip.context': 'Operational context',
  'master.batteryV2Shadow.lvMeasured.metric.observationSpan': 'C3 observation span',
  'master.batteryV2Shadow.lvMeasured.metric.validRestPoints': 'C3 valid rest pts',
  'master.batteryV2Shadow.lvMeasured.slope.contextLimited': 'CONTEXT_LIMITED slope (not a reliable resting self-discharge trend)',
  'master.batteryV2Shadow.lvMeasured.slope.contextLimitedBadge': 'CONTEXT_LIMITED',
  'master.batteryV2Shadow.lvMeasured.mobileDerivedSlope': 'DERIVED slope:',
  'master.batteryV2Shadow.lvMeasured.mobileC3Span': 'C3 span',
  'master.batteryV2Shadow.lvMeasured.slope.interpretable': 'Rest self-discharge trend (C3 Theil-Sen)',
  'master.batteryV2Shadow.lvMeasured.selectEpisode': 'Inspect session',
  'master.batteryV2Shadow.lvMeasured.endReason': 'End reason',
  'master.batteryV2Shadow.lvMeasured.evidence.section.measurement': 'Measurement',
  'master.batteryV2Shadow.lvMeasured.evidence.section.operational': 'Operational state',
  'master.batteryV2Shadow.lvMeasured.evidence.section.quality': 'Data quality / usability',
  'master.batteryV2Shadow.lvMeasured.evidence.section.interpretation': 'Internal interpretation (evidence, not health)',
  'master.batteryV2Shadow.lvMeasured.evidence.measuredAt': 'Measured at (stored voltageObservedAt)',
  'master.batteryV2Shadow.lvMeasured.evidence.evidenceClass': 'Stored evidenceClass',
  'master.batteryV2Shadow.lvMeasured.evidence.batteryHealth': 'Battery health assessment',
  'master.batteryV2Shadow.lvMeasured.evidence.cranking': 'Cranking evidence',
  'master.batteryV2Shadow.lvMeasured.evidence.notHealthAssessment':
    'This panel is generalized-evidence review only — not a validated SOH or GOOD/BAD battery verdict.',
  'master.batteryV2Shadow.lvMeasured.evidence.openGapsDetail':
    '{{count}} open provider observability gap(s) — coverage may be incomplete between measurements.',
  'master.batteryV2Shadow.lvMeasured.boundary.batteryHealthNotAssessed': 'Not available (NOT_ASSESSED)',
  'master.batteryV2Shadow.lvMeasured.n16Shadow.title': 'N16 estimated health (shadow, read-only)',
  'master.batteryV2Shadow.lvMeasured.n16Shadow.boundaryNote':
    'Separate from measured-intelligence NOT_ASSESSED boundary — internal shadow classification only; not customer publication.',
  'master.batteryV2Shadow.lvMeasured.n16Shadow.status': 'Estimated status',
  'master.batteryV2Shadow.lvMeasured.n16Shadow.confidence': 'Confidence',
  'master.batteryV2Shadow.lvMeasured.n16Shadow.eligibility': 'Eligibility',
  'master.batteryV2Shadow.lvMeasured.n16Shadow.episodes': 'Qualified episodes',
  'master.batteryV2Shadow.lvMeasured.n16Shadow.dataSelection':
    'GE window: {{raw}} raw voltage rows · {{eligible}} eligible REST · truncated={{truncated}}',
  'master.batteryV2Shadow.lvMeasured.n16Shadow.rule': 'Decision rule',
  'master.batteryV2Shadow.lvMeasured.n16Shadow.loading': 'Loading N16 shadow assessment…',
  'master.batteryV2Shadow.lvMeasured.n16Shadow.unavailable': 'N16 shadow assessment could not be loaded.',
  'master.batteryV2Shadow.lvMeasured.cranking.unknown': 'UNKNOWN',
  'master.batteryV2Shadow.lvMeasured.cranking.notInReadModel':
    'No confirmed cranking capture in LV_MEASURED_INTELLIGENCE_V1 — do not infer startability from voltage alone.',
  'master.batteryV2Shadow.lvMeasured.missing.providerTime':
    'Provider timestamp not stored on this row — use measuredAt for ordering.',
  'master.batteryV2Shadow.lvMeasured.missing.slopeNotComputed':
    'DERIVED slope not computed for this session (see limitation codes in details).',
  'master.batteryV2Shadow.lvMeasured.missing.observationSpan':
    'Observation span not available — insufficient DERIVED feature row.',
  'master.batteryV2Shadow.lvMeasured.missing.validRestPoints':
    'Valid rest point count not published — C3 inputs incomplete for this session.',
  'master.batteryV2Shadow.lvMeasured.missing.endReason': 'Session end reason not recorded.',
  'master.batteryV2Shadow.lvMeasured.missing.d4Revision': 'No bounded D3/D4 revision loaded for this vehicle.',
  'master.batteryV2Shadow.lvMeasured.interpretation.openProviderGaps':
    'Open provider gaps mean telemetry may be missing between stored MEASURED rows.',
  'master.batteryV2Shadow.lvMeasured.interpretation.lvChargingActive':
    'LV charging flag is true — voltage reflects charging context, not a resting baseline.',
  'master.batteryV2Shadow.lvMeasured.interpretation.engineRunning':
    'Engine running flag is true — voltage is not a parked-rest sample.',
  'master.batteryV2Shadow.lvMeasured.interpretation.noExtraFlags': '',
  'master.batteryV2Shadow.lvMeasured.evidenceClass.unmapped':
    'Unmapped evidenceClass in UI dictionary — treat as stored pipeline label only.',
  'master.batteryV2Shadow.lvMeasured.evidenceClass.PARKED_REST_CANDIDATE':
    'Parked rest candidate — voltage suitable for internal rest-series review when context stays stable.',
  'master.batteryV2Shadow.lvMeasured.evidenceClass.REST_STABLE_VOLTAGE':
    'Stable rest voltage sample — preferred for resting voltage inspection.',
  'master.batteryV2Shadow.lvMeasured.evidenceClass.REST_WAKE_VOLTAGE':
    'Rest wake voltage — may include wake/load effects; not a confirmed cranking event.',
  'master.batteryV2Shadow.lvMeasured.evidenceClass.DRIVING_NON_CHARGING':
    'Driving, not charging — voltage mixes alternator/load; not a rest baseline.',
  'master.batteryV2Shadow.lvMeasured.evidenceClass.DRIVING_CHARGING':
    'Driving while charging — voltage dominated by charging/alternator context.',
  'master.batteryV2Shadow.lvMeasured.evidenceClass.ENGINE_OFF_TRANSITION':
    'Engine-off transition — short-lived context; avoid resting-trend conclusions.',
  'master.batteryV2Shadow.lvMeasured.evidenceClass.CHARGING_CONTAMINATED':
    'Charging-contaminated evidence — resting interpretation is context-limited.',
  'master.batteryV2Shadow.lvMeasured.evidenceClass.ACTIVE_VEHICLE_CONTAMINATED':
    'Active-vehicle contamination — resting interpretation is context-limited.',
  'master.batteryV2Shadow.lvMeasured.evidenceClass.STALE_REPLAY':
    'Stale replay — timestamp or replay semantics reduce trust for freshness.',
  'master.batteryV2Shadow.lvMeasured.evidenceClass.STATE_AMBIGUOUS':
    'Ambiguous vehicle state — operational context may not match resting use.',
  'master.batteryV2Shadow.lvMeasured.evidenceClass.UNKNOWN':
    'Unknown evidence class — usability not established in the stored row.',
  'master.batteryV2Shadow.lvMeasured.usability.restCandidate.label': 'Usable for rest review (context-dependent)',
  'master.batteryV2Shadow.lvMeasured.usability.restCandidate.explanation':
    'Stored as parked rest candidate — suitable for internal MEASURED review when session context remains stable.',
  'master.batteryV2Shadow.lvMeasured.usability.restStable.label': 'Usable resting voltage sample',
  'master.batteryV2Shadow.lvMeasured.usability.restStable.explanation':
    'Stable rest class — preferred for inspecting resting voltage level (still not a health verdict).',
  'master.batteryV2Shadow.lvMeasured.usability.restWake.label': 'Limited — wake/rest transition',
  'master.batteryV2Shadow.lvMeasured.usability.restWake.explanation':
    'Wake-related rest voltage — do not treat as confirmed cranking or SOH evidence.',
  'master.batteryV2Shadow.lvMeasured.usability.driving.label': 'Limited — driving context',
  'master.batteryV2Shadow.lvMeasured.usability.driving.explanation':
    'Driving sample — voltage reflects alternator/load, not a resting baseline.',
  'master.batteryV2Shadow.lvMeasured.usability.drivingCharging.label': 'Limited — driving + charging',
  'master.batteryV2Shadow.lvMeasured.usability.drivingCharging.explanation':
    'Charging while driving — not suitable for resting self-discharge interpretation.',
  'master.batteryV2Shadow.lvMeasured.usability.transition.label': 'Limited — transition',
  'master.batteryV2Shadow.lvMeasured.usability.transition.explanation':
    'Engine-off transition — short window; avoid trend or health conclusions.',
  'master.batteryV2Shadow.lvMeasured.usability.chargingContaminated.label': 'Limited — charging contamination',
  'master.batteryV2Shadow.lvMeasured.usability.chargingContaminated.explanation':
    'Charging contamination flag on evidence — resting metrics may be biased.',
  'master.batteryV2Shadow.lvMeasured.usability.activeContaminated.label': 'Limited — active vehicle contamination',
  'master.batteryV2Shadow.lvMeasured.usability.activeContaminated.explanation':
    'Active-vehicle contamination — resting interpretation is not reliable.',
  'master.batteryV2Shadow.lvMeasured.usability.staleReplay.label': 'Insufficient — stale replay',
  'master.batteryV2Shadow.lvMeasured.usability.staleReplay.explanation':
    'Replay/staleness semantics — do not treat as a fresh operational snapshot.',
  'master.batteryV2Shadow.lvMeasured.usability.ambiguous.label': 'Insufficient — ambiguous state',
  'master.batteryV2Shadow.lvMeasured.usability.ambiguous.explanation':
    'Ambiguous state — operational context cannot support resting conclusions.',
  'master.batteryV2Shadow.lvMeasured.usability.unknownClass.label': 'Insufficient — unknown class',
  'master.batteryV2Shadow.lvMeasured.usability.unknownClass.explanation':
    'Unknown stored class — inspect raw evidenceClass and provider gaps before use.',
  'master.batteryV2Shadow.lvMeasured.usability.unmapped.label': 'Limited — unmapped class label',
  'master.batteryV2Shadow.lvMeasured.usability.unmapped.explanation':
    'evidenceClass not in UI map — use stored enum string; no automatic health classification.',
  'master.batteryV2Shadow.lvMeasured.episode.mobile.measurementCount': '{{count}} MEASURED point(s) in episode window',
  'master.batteryV2Shadow.lvMeasured.episode.mobile.technicalDetails': 'Technical details (C3 / DERIVED / codes)',
  'master.batteryV2Shadow.lvMeasured.episode.eval.none.label': 'Not evaluable',
  'master.batteryV2Shadow.lvMeasured.episode.eval.none.explanation':
    'No deduped MEASURED points linked to this REST episode — nothing to plot or derive.',
  'master.batteryV2Shadow.lvMeasured.episode.eval.noDerived.label': 'Partially evaluable',
  'master.batteryV2Shadow.lvMeasured.episode.eval.noDerived.explanation':
    'MEASURED points exist but no DERIVED feature summary was returned for this session.',
  'master.batteryV2Shadow.lvMeasured.episode.eval.contextLimited.label': 'Context-limited',
  'master.batteryV2Shadow.lvMeasured.episode.eval.contextLimited.explanation':
    'Session marked CONTEXT_LIMITED — resting slope/trend is not presented as reliable.',
  'master.batteryV2Shadow.lvMeasured.episode.eval.slopeLimited.label': 'Trend context-limited',
  'master.batteryV2Shadow.lvMeasured.episode.eval.slopeLimited.explanation':
    'DERIVED slope is CONTEXT_LIMITED (policy codes in technical details) — not a health assessment.',
  'master.batteryV2Shadow.lvMeasured.episode.eval.trendReady.label': 'Internally trend-ready',
  'master.batteryV2Shadow.lvMeasured.episode.eval.trendReady.explanation':
    'DERIVED rest self-discharge trend is interpretable for engineering review — still not customer battery health.',
};

export function resolveBatteryV2ShadowCopy(key: string, params?: Record<string, string | number>): string {
  let text = COPY[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{{${k}}}`, String(v));
    }
  }
  return text;
}
