/** Canonical English keys for Master Intelligence Center (PR1). */
export const masterIntelligenceEn = {
  'master.nav.vsiIntelligence': 'VSI – Signal Intelligence',
  'master.nav.apdsIntelligence': 'APDS – Adaptive Polling',

  'master.intelligence.vsi.title': 'VSI – Signal Intelligence',
  'master.intelligence.vsi.description':
    'Read-only vehicle signal profiles, observed cadence labels, revision history when captured, and capability resolver explanations from production data.',
  'master.intelligence.apds.title': 'APDS – Adaptive Polling',
  'master.intelligence.apds.description':
    'Read-only shadow reconciliation decisions, activation epoch history, real poll evidence when linked, and historical VSI correlation. Simulated next-poll times are not executed polls.',

  'master.intelligence.apds.loading': 'Loading APDS read models…',
  'master.intelligence.apds.error': 'Could not load APDS intelligence.',
  'master.intelligence.apds.latestDecision': 'Latest persisted decision',
  'master.intelligence.apds.activeEpoch': 'Active epoch',
  'master.intelligence.apds.decisionsForVehicle': 'decisions for this vehicle in epoch',
  'master.intelligence.apds.shadowNotReal':
    'Shadow recommendations and simulated next-poll timestamps are not proof of a real scheduled or executed poll.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'Historical VSI correlation is research evidence — it did not necessarily drive this APDS decision at runtime.',
  'master.intelligence.apds.openVsiAsOf': 'Open VSI with decision as-of time',

  'master.intelligence.apds.empty.selectScope.title': 'Select organization and vehicle',
  'master.intelligence.apds.empty.selectScope.body':
    'Choose scope to load persisted shadow decisions and epochs. Provider source link enables VSI correlation; scope is validated server-side.',

  'master.intelligence.apds.section.epochs': 'Activation epoch timeline',
  'master.intelligence.apds.section.decisions': 'Decision explorer',
  'master.intelligence.apds.section.detail': 'Decision detail',

  'master.intelligence.apds.col.time': 'Decision time',
  'master.intelligence.apds.col.reason': 'Reason',
  'master.intelligence.apds.col.policy': 'Policy',
  'master.intelligence.apds.col.realPoll': 'Real poll link',

  'master.intelligence.apds.detail.shadow': 'Shadow recommendation (persisted outputs)',
  'master.intelligence.apds.detail.realPoll': 'Real poll evidence',
  'master.intelligence.apds.detail.vsiCorrelation': 'VSI historical correlation',

  'master.intelligence.apds.availability.AVAILABLE': 'Shadow evidence available',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'APDS shadow not activated for this scope',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'No reconciliation decisions captured',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Persisted history unavailable',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Evidence incomplete for this scope',

  'master.intelligence.apds.realPoll.NOT_LINKED': 'Not linked to a real poll',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Linked — poll log not verified',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Linked — success recorded',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Linked — non-success status',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Real poll evidence not available',

  'master.intelligence.pdi.loading': 'Loading device intelligence…',
  'master.intelligence.pdi.error': 'Could not load PDI device intelligence.',
  'master.intelligence.pdi.section.identity': 'Identity summary',
  'master.intelligence.pdi.section.timeline': 'Chronological timeline',
  'master.intelligence.pdi.section.episodes': 'Connection episodes',
  'master.intelligence.pdi.section.drift': 'Identity monitoring',
  'master.intelligence.pdi.snapshotNotHistory':
    'Current inventory and live mirror observations are snapshots — not a full historical record.',
  'master.intelligence.pdi.notApplicableR1':
    'Physical Ruptela R1 identity monitoring does not apply (e.g. software-only Tesla integration).',
  'master.intelligence.pdi.noDriftHistory':
    'No persisted drift event history. Missing records does not prove there was no drift.',
  'master.intelligence.pdi.episodeNotPoll':
    'Connection episodes are persisted lifecycle evidence — not APDS poll execution.',
  'master.intelligence.pdi.noEpisodes': 'No connection episodes for the current vehicle scope.',
  'master.intelligence.pdi.emptyTimeline': 'No timeline entries in persisted history.',
  'master.intelligence.pdi.evaluatedAt': 'Evidence evaluated',

  'master.intelligence.section.context': 'URL context',
  'master.intelligence.section.crossLinks': 'Cross-links',
  'master.intelligence.section.previewComponents': 'Presentation preview (not live data)',
  'master.intelligence.section.evidenceSemantics': 'Evidence semantics',

  'master.intelligence.url.invalidParams': 'Ignored invalid URL parameters: {{params}}',

  'master.intelligence.vsi.previewNote':
    'Badges below illustrate backend label semantics only. Values are not loaded from production in PR1.',
  'master.intelligence.vsi.empty.title': 'Read APIs not connected yet',
  'master.intelligence.vsi.empty.body':
    'PR2 will load vehicle signal profiles, revision history when captured, and capability resolver explanations from read-only backend endpoints.',

  'master.intelligence.apds.empty.title': 'Read APIs not connected yet',
  'master.intelligence.apds.empty.body':
    'PR3 will load shadow decisions, activation epochs, and VSI correlation evidence. Shadow rows are never shown as executed polls.',

  'master.intelligence.crossLink.vehicle': 'Open vehicle',
  'master.intelligence.crossLink.device': 'Open device inventory',
  'master.intelligence.crossLink.vsi': 'Open VSI',
  'master.intelligence.crossLink.apds': 'Open APDS',
  'master.intelligence.crossLink.contextMissing': 'Link to {{target}} needs more context in the URL (PR2/PR3).',

  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8h observed',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24h observed',
  'master.intelligence.badge.lv.UNKNOWN': 'LV unknown',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Observed approximately 8-hour standby transmission cadence (not confirmed hardware configuration).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Observed approximately 24-hour standby transmission cadence (not confirmed hardware configuration).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Insufficient or blocked standby transmission evidence.',

  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM high-frequency (empirical)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standard (empirical)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM unknown',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Empirically classified high-frequency RPM profile. Not proof of native 1 Hz device sampling.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD':
    'Empirically classified standard RPM observation density.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Insufficient RPM cadence evidence for a stable label.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'ICE RPM profile not applicable (e.g. BEV). This is not the same as unknown signal quality.',

  'master.intelligence.badge.limitation': 'Backend limitation: {{code}}',

  'master.intelligence.confidence.HIGH': 'Confidence: high',
  'master.intelligence.confidence.MEDIUM': 'Confidence: medium',
  'master.intelligence.confidence.LOW': 'Confidence: low',
  'master.intelligence.confidence.UNKNOWN': 'Confidence: unknown',

  'master.intelligence.density.SUB_ONE_HZ': 'Density: sub-1 Hz buckets',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Density: 1 s buckets unproven',
  'master.intelligence.density.IRREGULAR': 'Density: irregular',
  'master.intelligence.density.UNKNOWN': 'Density: unknown',
  'master.intelligence.density.NOT_APPLICABLE': 'Density: not applicable',

  'master.intelligence.evidence.title': 'Evidence timestamps',
  'master.intelligence.evidence.evaluatedAt': 'Evaluated at',
  'master.intelligence.evidence.providerSourceTimestamp': 'Provider source time',
  'master.intelligence.evidence.providerFetchedAt': 'Provider fetch time',
  'master.intelligence.evidence.profileRevision': 'Profile revision',
  'master.intelligence.evidence.fetchNotSignalProof':
    'Fetch time shows when SynqDrive ingested data — not proof of a new provider signal.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'APDS shadow decisions describe simulated reconciliation outcomes unless a real poll ID is linked.',

  'master.intelligence.evidence.kind.observed': 'Kind: observed provider evidence',
  'master.intelligence.evidence.kind.simulated_shadow': 'Kind: simulated / shadow evaluation',
  'master.intelligence.evidence.kind.verified_real_execution': 'Kind: verified real poll execution',
  'master.intelligence.evidence.kind.not_available': 'Kind: not available',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Kind: insufficient evidence',
  'master.intelligence.evidence.kind.not_applicable': 'Kind: not applicable',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Kind: evaluation blocked',

  'master.intelligence.blocked.title': 'Evaluation blocked',
  'master.intelligence.blocked.body':
    'Profile classification is paused ({{code}}). An older label must not be shown as current.',

  'master.intelligence.section.fleetOverview': 'Fleet scope & profiles',
  'master.intelligence.section.signals': 'Signal detail',
  'master.intelligence.section.revisions': 'Profile revision history',
  'master.intelligence.section.capability': 'Capability resolver (read-only)',

  'master.intelligence.vsi.picker.org': 'Organization',
  'master.intelligence.vsi.picker.vehicle': 'Vehicle',
  'master.intelligence.vsi.picker.link': 'Provider source link',
  'master.intelligence.vsi.loading': 'Loading VSI read models…',
  'master.intelligence.vsi.error': 'Could not load VSI intelligence.',
  'master.intelligence.vsi.retry': 'Retry',

  'master.intelligence.vsi.empty.selectScope.title': 'Select organization and vehicle',
  'master.intelligence.vsi.empty.selectScope.body':
    'Choose an organization and vehicle to load persisted VSI signal profiles. Scope is validated server-side; no cross-tenant access.',

  'master.intelligence.vsi.noProfiles.title': 'No VSI profiles materialized',
  'master.intelligence.vsi.noProfiles.body':
    'No signal capability profile exists yet for this vehicle. This is not the same as revision history being disabled.',

  'master.intelligence.vsi.decision.lv': 'LV decision code: {{code}}',
  'master.intelligence.vsi.decision.rpm': 'RPM decision code: {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Cadence labels describe observed transmission patterns, not native hardware configuration.',
  'master.intelligence.vsi.signals.canonical': 'Canonical signal',
  'master.intelligence.vsi.signals.provider': 'Provider name',
  'master.intelligence.vsi.signals.quality': 'Quality / confidence',
  'master.intelligence.vsi.signals.observedAt': 'Last observation (UTC + local)',
  'master.intelligence.vsi.signals.limitations': 'Limitations',

  'master.intelligence.vsi.signals.rpmDual.intro':
    'Engine RPM uses two separate evidence planes. Snapshot status comes from the latest vehicle latest-state bundle; HF/cadence status comes from mirrored high-frequency points and finalized trips. They are not interchangeable.',
  'master.intelligence.vsi.signals.rpmDual.snapshotHeading': 'Snapshot (vehicle latest state)',
  'master.intelligence.vsi.signals.rpmDual.snapshotWindow':
    'Observation window: latest attributed provider bundle at profile materialization (not HF history).',
  'master.intelligence.vsi.signals.rpmDual.cadenceHeading': 'HF / cadence (trip windows)',
  'master.intelligence.vsi.signals.rpmDual.cadenceWindow':
    'Observation window: link-scoped HF cadence enrichment (typically up to 14 days of finalized trips).',
  'master.intelligence.vsi.signals.rpmDual.empirical': 'Empirical observation',
  'master.intelligence.vsi.signals.rpmDual.freshness': 'Freshness',
  'master.intelligence.vsi.signals.rpmDual.lastValid': 'Last valid observation',
  'master.intelligence.vsi.signals.rpmDual.quality': 'Quality / confidence',
  'master.intelligence.vsi.signals.rpmDual.provenance': 'Provenance',
  'master.intelligence.vsi.signals.rpmDual.observedSamples': 'HF sample count',
  'master.intelligence.vsi.signals.rpmDual.activeProfile': 'Active RPM profile',
  'master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt': 'Profile evaluated at',
  'master.intelligence.vsi.signals.rpmDual.finalizedTrips': 'Finalized trips in cadence window',
  'master.intelligence.vsi.signals.rpmDual.decision': 'Classification decision',
  'master.intelligence.vsi.signals.rpmDual.tripSupport': 'Supporting trip classifications',
  'master.intelligence.vsi.signals.rpmDual.notApplicable':
    'RPM cadence classification is not applicable for this powertrain (e.g. battery-electric).',
  'master.intelligence.vsi.signals.rpmDual.noHfEvidence':
    'No HF cadence evidence in the persisted profile (missing or empty cadenceIntelligence).',
  'master.intelligence.vsi.signals.rpmDual.snapshotShort': 'Snapshot',
  'master.intelligence.vsi.signals.rpmDual.cadenceShort': 'HF/cadence',
  'master.intelligence.vsi.signals.rpmDual.hfEvidenceLine':
    '{{profile}} profile · {{samples}} HF samples (see panel)',
  'master.intelligence.vsi.signals.rpmDual.seePanel': 'See dual panel below',

  'master.intelligence.vsi.revision.loading': 'Loading revision history…',
  'master.intelligence.vsi.revision.loadError': 'Revision history could not be loaded.',
  'master.intelligence.vsi.revision.retry': 'Retry revision history',
  'master.intelligence.vsi.revision.notCaptured': 'Revision history: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'P5-H1 revision capture is disabled in this environment. Missing history does not mean the profile never changed.',
  'master.intelligence.vsi.revision.moreAvailable': 'More revisions available — use cursor pagination via API.',

  'master.intelligence.vsi.asOf.title': 'As-of revision resolution',
  'master.intelligence.vsi.asOf.decisionAt': 'Decision time',
  'master.intelligence.vsi.asOf.authority': 'Authority',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'Read-only summaries from VSI, APDS, and PDI APIs. Labels reflect observed or persisted evidence — not hardware proof.',
  'master.intelligence.vehicleDetail.loading': 'Loading intelligence summaries…',
  'master.intelligence.vehicleDetail.error': 'Could not load intelligence summaries for this vehicle.',
  'master.intelligence.vehicleDetail.openVsi': 'Open VSI detail',
  'master.intelligence.vehicleDetail.openApds': 'Open APDS detail',
  'master.intelligence.vehicleDetail.openPdi': 'Open device detail',
  'master.intelligence.vehicleDetail.noApdsDecision': 'No persisted decision in scope.',
  'master.intelligence.vehicleDetail.noPhysicalDevice': 'No single installed physical device attributed to this vehicle.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Multiple provider source links — primary link shown; confirm link on VSI/APDS before cross-vehicle assumptions.',
} as const;

export type MasterIntelligenceTranslationKey = keyof typeof masterIntelligenceEn;
