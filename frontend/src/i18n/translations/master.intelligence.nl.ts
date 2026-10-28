export const masterIntelligenceNl = {
  'master.nav.vsiIntelligence': 'VSI – signaalintelligentie',
  'master.nav.apdsIntelligence': 'APDS – adaptief pollen',
  'master.intelligence.vsi.title': 'VSI – signaalintelligentie',
  'master.intelligence.vsi.description':
    'Alleen-lezen signaalprofielen, waargenomen cadans en bewijs. Live vlootdata in PR2.',
  'master.intelligence.apds.title': 'APDS – adaptief pollen',
  'master.intelligence.apds.description':
    'Shadow-reconciliatiebeslissingen en gekoppeld echt poll-bewijs. Geschiedenis in PR3.',
  'master.intelligence.section.context': 'URL-context',
  'master.intelligence.section.crossLinks': 'Kruislinks',
  'master.intelligence.section.previewComponents': 'Presentatiepreview (geen live data)',
  'master.intelligence.section.evidenceSemantics': 'Betekenis van bewijs',
  'master.intelligence.url.invalidParams': 'Ongeldige URL-parameters genegeerd: {{params}}',
  'master.intelligence.vsi.previewNote':
    'Badges tonen alleen backend-labelsemantiek. Geen productiedata in PR1.',
  'master.intelligence.vsi.empty.title': 'Read-API’s nog niet gekoppeld',
  'master.intelligence.vsi.empty.body':
    'PR2 laadt voertuigsignalprofielen, revisiegeschiedenis en resolver-uitleg via read-only endpoints.',
  'master.intelligence.apds.empty.title': 'Read-API’s nog niet gekoppeld',
  'master.intelligence.apds.empty.body':
    'PR3 laadt shadow-beslissingen, activatie-episodes en VSI-correlatie. Shadow is nooit een uitgevoerde poll.',
  'master.intelligence.crossLink.vehicle': 'Voertuig openen',
  'master.intelligence.crossLink.device': 'Apparaatinventaris openen',
  'master.intelligence.crossLink.vsi': 'VSI openen',
  'master.intelligence.crossLink.apds': 'APDS openen',
  'master.intelligence.crossLink.contextMissing':
    'Link naar {{target}} vereist meer context in de URL (PR2/PR3).',
  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8 u waargenomen',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24 u waargenomen',
  'master.intelligence.badge.lv.UNKNOWN': 'LV onbekend',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Waargenomen standby-transmissie ongeveer elke 8 uur (geen bevestigde hardwareconfiguratie).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Waargenomen standby-transmissie ongeveer elke 24 uur (geen bevestigde hardwareconfiguratie).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Onvoldoende of geblokkeerd standby-transmissiebewijs.',
  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM hoge frequentie (empirisch)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standaard (empirisch)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM onbekend',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Empirisch geclassificeerd RPM-profiel met hoge frequentie. Geen bewijs van native 1 Hz sampling.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD': 'Empirisch geclassificeerde standaard RPM-dichtheid.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Onvoldoende RPM-cadansbewijs voor een stabiel label.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'ICE RPM-profiel niet van toepassing (bv. BEV). Dat is niet hetzelfde als onbekende signaalkwaliteit.',
  'master.intelligence.badge.limitation': 'Backendbeperking: {{code}}',
  'master.intelligence.confidence.HIGH': 'Vertrouwen: hoog',
  'master.intelligence.confidence.MEDIUM': 'Vertrouwen: middel',
  'master.intelligence.confidence.LOW': 'Vertrouwen: laag',
  'master.intelligence.confidence.UNKNOWN': 'Vertrouwen: onbekend',
  'master.intelligence.density.SUB_ONE_HZ': 'Dichtheid: onder 1 Hz',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Dichtheid: 1s buckets niet bewezen',
  'master.intelligence.density.IRREGULAR': 'Dichtheid: onregelmatig',
  'master.intelligence.density.UNKNOWN': 'Dichtheid: onbekend',
  'master.intelligence.density.NOT_APPLICABLE': 'Dichtheid: n.v.t.',
  'master.intelligence.evidence.title': 'Bewijstijdstempels',
  'master.intelligence.evidence.evaluatedAt': 'Geëvalueerd op',
  'master.intelligence.evidence.providerSourceTimestamp': 'Brontijd provider',
  'master.intelligence.evidence.providerFetchedAt': 'Fetch-tijd provider',
  'master.intelligence.evidence.profileRevision': 'Profielrevisie',
  'master.intelligence.evidence.fetchNotSignalProof':
    'Fetch-tijd is SynqDrive-ingest — geen bewijs van een nieuw providersignaal.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'APDS shadow-beslissingen zijn gesimuleerde reconciliatie tenzij een echt poll-ID is gekoppeld.',
  'master.intelligence.evidence.kind.observed': 'Soort: waargenomen providerbewijs',
  'master.intelligence.evidence.kind.simulated_shadow': 'Soort: gesimuleerde / shadow evaluatie',
  'master.intelligence.evidence.kind.verified_real_execution': 'Soort: geverifieerde echte poll',
  'master.intelligence.evidence.kind.not_available': 'Soort: niet beschikbaar',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Soort: onvoldoende bewijs',
  'master.intelligence.evidence.kind.not_applicable': 'Soort: n.v.t.',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Soort: evaluatie geblokkeerd',
  'master.intelligence.blocked.title': 'Evaluatie geblokkeerd',
  'master.intelligence.blocked.body':
    'Profielclassificatie gepauzeerd ({{code}}). Een ouder label mag niet als actueel worden getoond.',

  'master.intelligence.section.fleetOverview': 'Vlootscope en profielen',
  'master.intelligence.section.signals': 'Signaaldetail',
  'master.intelligence.section.revisions': 'Profielrevisiegeschiedenis',
  'master.intelligence.section.capability': 'Capability resolver (alleen lezen)',

  'master.intelligence.vsi.picker.org': 'Organisatie',
  'master.intelligence.vsi.picker.vehicle': 'Voertuig',
  'master.intelligence.vsi.picker.link': 'Provider bronlink',
  'master.intelligence.vsi.loading': 'VSI-leesmodellen laden…',
  'master.intelligence.vsi.error': 'VSI-intelligence kon niet worden geladen.',
  'master.intelligence.vsi.retry': 'Opnieuw',

  'master.intelligence.vsi.empty.selectScope.title': 'Kies organisatie en voertuig',
  'master.intelligence.vsi.empty.selectScope.body':
    'Kies organisatie en voertuig om opgeslagen VSI-profielen te laden. Scope wordt server-side gevalideerd.',

  'master.intelligence.vsi.noProfiles.title': 'Geen VSI-profielen gematerialiseerd',
  'master.intelligence.vsi.noProfiles.body':
    'Er is nog geen capability-profiel voor dit voertuig. Dat is niet hetzelfde als uitgeschakelde revisiehistorie.',

  'master.intelligence.vsi.decision.lv': 'LV-beslissingscode: {{code}}',
  'master.intelligence.vsi.decision.rpm': 'RPM-beslissingscode: {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Cadence-labels beschrijven waargenomen transmissiepatronen, geen native hardwareconfiguratie.',
  'master.intelligence.vsi.signals.canonical': 'Canoniek signaal',
  'master.intelligence.vsi.signals.provider': 'Providernaam',
  'master.intelligence.vsi.signals.quality': 'Kwaliteit / vertrouwen',
  'master.intelligence.vsi.signals.observedAt': 'Laatste waarneming (UTC + lokaal)',
  'master.intelligence.vsi.signals.limitations': 'Beperkingen',

  'master.intelligence.vsi.revision.notCaptured': 'Revisiehistorie: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'P5-H1-registratie is uitgeschakeld. Ontbrekende historie betekent niet dat het profiel nooit wijzigde.',
  'master.intelligence.vsi.revision.moreAvailable': 'Meer revisies — cursorpaginering via API.',

  'master.intelligence.vsi.asOf.title': 'As-of revisie-oplossing',
  'master.intelligence.vsi.asOf.decisionAt': 'Beslissingstijd',
  'master.intelligence.vsi.asOf.authority': 'Autoriteit',
} as const;
