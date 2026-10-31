export const masterIntelligenceNl = {
  'master.nav.vsiIntelligence': 'VSI – signaalintelligentie',
  'master.nav.apdsIntelligence': 'APDS – adaptief pollen',
  'master.intelligence.vsi.title': 'VSI – signaalintelligentie',
  'master.intelligence.vsi.description':
    'Alleen-lezen signaalprofielen, waargenomen cadans en bewijs. Live vlootdata in PR2.',
  'master.intelligence.apds.title': 'APDS – adaptief pollen',
  'master.intelligence.apds.description':
    'Alleen-lezen shadow-reconciliatiebeslissingen, epochgeschiedenis, echt poll-bewijs indien gekoppeld en historische VSI-correlatie. Gesimuleerde next-poll tijden zijn geen uitgevoerde polls.',

  'master.intelligence.apds.loading': 'APDS-leesmodellen laden…',
  'master.intelligence.apds.error': 'APDS intelligence kon niet worden geladen.',
  'master.intelligence.apds.latestDecision': 'Laatste opgeslagen beslissing',
  'master.intelligence.apds.activeEpoch': 'Actieve epoch',
  'master.intelligence.apds.decisionsForVehicle': 'beslissingen voor dit voertuig in epoch',
  'master.intelligence.apds.shadowNotReal':
    'Shadow-aanbevelingen en gesimuleerde next-poll timestamps zijn geen bewijs van een geplande of uitgevoerde echte poll.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'Historische VSI-correlatie is onderzoeksbewijs — het stuurde deze APDS-beslissing niet per se tijdens runtime.',
  'master.intelligence.apds.openVsiAsOf': 'VSI openen met as-of tijd van beslissing',
  'master.intelligence.apds.empty.selectScope.title': 'Selecteer organisatie en voertuig',
  'master.intelligence.apds.empty.selectScope.body':
    'Kies scope om opgeslagen shadow-beslissingen en epochs te laden. Providerbronlink maakt VSI-correlatie mogelijk; scope wordt server-side gevalideerd.',
  'master.intelligence.apds.section.epochs': 'Tijdlijn activeringsepochs',
  'master.intelligence.apds.section.decisions': 'Beslissingsverkenner',
  'master.intelligence.apds.section.detail': 'Beslissingsdetail',
  'master.intelligence.apds.col.time': 'Beslissingstijd',
  'master.intelligence.apds.col.reason': 'Reden',
  'master.intelligence.apds.col.policy': 'Beleid',
  'master.intelligence.apds.col.realPoll': 'Echte poll-koppeling',
  'master.intelligence.apds.detail.shadow': 'Shadow-aanbeveling (opgeslagen outputs)',
  'master.intelligence.apds.detail.realPoll': 'Echt poll-bewijs',
  'master.intelligence.apds.detail.vsiCorrelation': 'Historische VSI-correlatie',
  'master.intelligence.apds.availability.AVAILABLE': 'Shadow-bewijs beschikbaar',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'APDS shadow niet geactiveerd voor deze scope',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'Geen reconciliation-beslissingen vastgelegd',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Opgeslagen geschiedenis niet beschikbaar',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Onvolledig bewijs voor deze scope',
  'master.intelligence.apds.realPoll.NOT_LINKED': 'Niet gekoppeld aan echte poll',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Gekoppeld — poll-log niet geverifieerd',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Gekoppeld — succes geregistreerd',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Gekoppeld — status zonder succes',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Echt poll-bewijs niet beschikbaar',
  'master.intelligence.pdi.loading': 'Apparaatintelligence laden…',
  'master.intelligence.pdi.error': 'PDI device intelligence kon niet worden geladen.',
  'master.intelligence.pdi.section.identity': 'Identiteitssamenvatting',
  'master.intelligence.pdi.section.timeline': 'Chronologische tijdlijn',
  'master.intelligence.pdi.section.episodes': 'Verbindingsepisodes',
  'master.intelligence.pdi.section.drift': 'Identiteitsmonitoring',
  'master.intelligence.pdi.snapshotNotHistory': 'Huidige snapshot en live mirror zijn geen volledige historie.',
  'master.intelligence.pdi.notApplicableR1': 'Fysieke R1-monitoring niet van toepassing (bijv. Tesla software-only).',
  'master.intelligence.pdi.noDriftHistory': 'Geen persistenter drift-geschiedenis. Geen records ≠ geen drift.',
  'master.intelligence.pdi.episodeNotPoll': 'Verbindingsepisodes zijn persistenter lifecycle-bewijs — geen APDS poll.',
  'master.intelligence.pdi.noEpisodes': 'Geen episodes voor huidige voertuigscope.',
  'master.intelligence.pdi.emptyTimeline': 'Geen timeline-items in persistenter historie.',
  'master.intelligence.pdi.evaluatedAt': 'Bewijs geëvalueerd',
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
  'master.intelligence.vsi.signals.empirical.NOT_APPLICABLE': 'Niet van toepassing (aandrijflijn)',
  'master.intelligence.vsi.signals.empirical.NEVER_OBSERVED': 'Nooit waargenomen',
  'master.intelligence.vsi.signals.empirical.OBSERVED': 'Waargenomen',
  'master.intelligence.vsi.signals.empirical.OBSERVED_STALE': 'Waargenomen (verouderd)',

  'master.intelligence.vsi.signals.rpmCombined.heading': 'Gecombineerde RPM-beschikbaarheid (afgeleid)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_LIVE': 'Live bewezen (verse snapshot)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_HISTORICAL_ONLY':
    'Alleen historisch bewezen (HF-cadans; snapshot niet live)',
  'master.intelligence.vsi.signals.rpmCombined.NOT_PROVEN': 'Niet bewezen',
  'master.intelligence.vsi.signals.rpmCombined.NOT_APPLICABLE': 'Niet van toepassing (aandrijflijn)',
  'master.intelligence.vsi.signals.rpmCombined.attributionLimited':
    'HF-bewijs niet toegeschreven aan deze source link',

  'master.intelligence.vsi.signals.rpmDual.intro':
    'Motortoerental (RPM) gebruikt twee aparte bewijslagen. Snapshotstatus komt uit de nieuwste vehicle-latest-state-bundle; HF/cadans uit gespiegelde HF-punten en afgeronde ritten. Ze zijn niet uitwisselbaar.',
  'master.intelligence.vsi.signals.rpmDual.snapshotHeading': 'Snapshot (vehicle latest state)',
  'master.intelligence.vsi.signals.rpmDual.snapshotWindow':
    'Observatievenster: nieuwste toegewezen providerbundle bij profielmaterialisatie (geen HF-geschiedenis).',
  'master.intelligence.vsi.signals.rpmDual.cadenceHeading': 'HF / cadans (ritvensters)',
  'master.intelligence.vsi.signals.rpmDual.cadenceWindow':
    'Observatievenster: link-gebonden HF-cadansverrijking (typisch tot 14 dagen afgeronde ritten).',
  'master.intelligence.vsi.signals.rpmDual.empirical': 'Empirische observatie',
  'master.intelligence.vsi.signals.rpmDual.freshness': 'Versheid',
  'master.intelligence.vsi.signals.rpmDual.lastValid': 'Laatste geldige observatie',
  'master.intelligence.vsi.signals.rpmDual.quality': 'Kwaliteit / vertrouwen',
  'master.intelligence.vsi.signals.rpmDual.provenance': 'Herkomst',
  'master.intelligence.vsi.signals.rpmDual.observedSamples': 'Aantal HF-monsters',
  'master.intelligence.vsi.signals.rpmDual.activeProfile': 'Actief RPM-profiel',
  'master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt': 'Profiel geëvalueerd op',
  'master.intelligence.vsi.signals.rpmDual.finalizedTrips': 'Afgeronde ritten in cadansvenster',
  'master.intelligence.vsi.signals.rpmDual.decision': 'Classificatiebeslissing',
  'master.intelligence.vsi.signals.rpmDual.tripSupport': 'Ondersteunende ritclassificaties',
  'master.intelligence.vsi.signals.rpmDual.notApplicable':
    'RPM-cadansclassificatie is niet van toepassing voor dit aandrijftype (bijv. BEV).',
  'master.intelligence.vsi.signals.rpmDual.noHfEvidence':
    'Geen HF-cadansbewijs in het opgeslagen profiel (cadenceIntelligence ontbreekt of leeg).',
  'master.intelligence.vsi.signals.rpmDual.snapshotShort': 'Snapshot',
  'master.intelligence.vsi.signals.rpmDual.cadenceShort': 'HF/cadans',
  'master.intelligence.vsi.signals.rpmDual.hfEvidenceLine':
    'Profiel {{profile}} · {{samples}} HF-monsters (zie paneel)',
  'master.intelligence.vsi.signals.rpmDual.seePanel': 'Zie paneel hieronder',

  'master.intelligence.vsi.revision.loading': 'Revisiehistorie laden…',
  'master.intelligence.vsi.revision.loadError': 'Revisiehistorie kon niet worden geladen.',
  'master.intelligence.vsi.revision.retry': 'Revisiehistorie opnieuw laden',
  'master.intelligence.vsi.revision.notCaptured': 'Revisiehistorie: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'P5-H1-registratie is uitgeschakeld. Ontbrekende historie betekent niet dat het profiel nooit wijzigde.',
  'master.intelligence.vsi.revision.moreAvailable': 'Meer revisies — cursorpaginering via API.',

  'master.intelligence.vsi.asOf.title': 'As-of revisie-oplossing',
  'master.intelligence.vsi.asOf.decisionAt': 'Beslissingstijd',
  'master.intelligence.vsi.asOf.authority': 'Autoriteit',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master Intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'Alleen-lezen samenvattingen uit VSI-, APDS- en PDI-API’s. Labels weerspiegelen waargenomen of bewaarde evidence — geen hardwarebewijs.',
  'master.intelligence.vehicleDetail.loading': 'Intelligence-samenvattingen laden…',
  'master.intelligence.vehicleDetail.error': 'Kon intelligence-samenvattingen voor dit voertuig niet laden.',
  'master.intelligence.vehicleDetail.openVsi': 'VSI-detail openen',
  'master.intelligence.vehicleDetail.openApds': 'APDS-detail openen',
  'master.intelligence.vehicleDetail.openPdi': 'Apparaatdetail openen',
  'master.intelligence.vehicleDetail.noApdsDecision': 'Geen persistenter besluit binnen scope.',
  'master.intelligence.vehicleDetail.noPhysicalDevice':
    'Geen enkel geïnstalleerd fysiek apparaat aan dit voertuig toegeschreven.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Meerdere provider-bronlinks — primaire link getoond; bevestig link in VSI/APDS vóór aannames over andere voertuigen.',
} as const;
