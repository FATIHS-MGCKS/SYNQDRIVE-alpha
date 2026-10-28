/** Canonical English keys for Master Intelligence Center (PR1). */
export const masterIntelligenceEn = {
  'master.nav.vsiIntelligence': 'VSI – Signal Intelligence',
  'master.nav.apdsIntelligence': 'APDS – Adaptive Polling',

  'master.intelligence.vsi.title': 'VSI – Signal Intelligence',
  'master.intelligence.vsi.description':
    'Read-only signal capability profiles, observed cadence labels, and evaluation evidence. Live fleet data arrives in PR2.',
  'master.intelligence.apds.title': 'APDS – Adaptive Polling',
  'master.intelligence.apds.description':
    'Shadow reconciliation decisions and linked real poll evidence. Live decision history arrives in PR3.',

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
} as const;

export type MasterIntelligenceTranslationKey = keyof typeof masterIntelligenceEn;
