export const masterIntelligenceCs = {
  'master.nav.vsiIntelligence': 'VSI – inteligence signálů',
  'master.nav.apdsIntelligence': 'APDS – adaptivní polling',
  'master.intelligence.vsi.title': 'VSI – inteligence signálů',
  'master.intelligence.vsi.description':
    'Profily signálů pouze ke čtení, pozorovaná kadence a důkazy vyhodnocení. Živá data v PR2.',
  'master.intelligence.apds.title': 'APDS – adaptivní polling',
  'master.intelligence.apds.description':
    'Shadow rozhodnutí reconciliace pouze ke čtení, historie epoch, důkazy reálného pollu (pokud propojeno) a historická korelace VSI. Simulované časy next poll nejsou provedené polly.',

  'master.intelligence.apds.loading': 'Načítání APDS read modelů…',
  'master.intelligence.apds.error': 'APDS intelligence se nepodařilo načíst.',
  'master.intelligence.apds.latestDecision': 'Poslední uložené rozhodnutí',
  'master.intelligence.apds.activeEpoch': 'Aktivní epocha',
  'master.intelligence.apds.decisionsForVehicle': 'rozhodnutí pro toto vozidlo v epoše',
  'master.intelligence.apds.shadowNotReal':
    'Shadow doporučení a simulované časové značky next poll nejsou důkazem naplánovaného ani provedeného reálného pollu.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'Historická korelace VSI je výzkumný důkaz — nemusela řídit toto APDS rozhodnutí za běhu.',
  'master.intelligence.apds.openVsiAsOf': 'Otevřít VSI s časem as-of rozhodnutí',
  'master.intelligence.apds.empty.selectScope.title': 'Vyberte organizaci a vozidlo',
  'master.intelligence.apds.empty.selectScope.body':
    'Zvolte rozsah pro načtení uložených shadow rozhodnutí a epoch. Odkaz zdroje providera umožní korelaci VSI; rozsah ověřuje server.',
  'master.intelligence.apds.section.epochs': 'Časová osa epoch aktivace',
  'master.intelligence.apds.section.decisions': 'Prohlížeč rozhodnutí',
  'master.intelligence.apds.section.detail': 'Detail rozhodnutí',
  'master.intelligence.apds.col.time': 'Čas rozhodnutí',
  'master.intelligence.apds.col.reason': 'Důvod',
  'master.intelligence.apds.col.policy': 'Politika',
  'master.intelligence.apds.col.realPoll': 'Odkaz na reálný poll',
  'master.intelligence.apds.detail.shadow': 'Shadow doporučení (uložené výstupy)',
  'master.intelligence.apds.detail.realPoll': 'Důkaz reálného pollu',
  'master.intelligence.apds.detail.vsiCorrelation': 'Historická korelace VSI',
  'master.intelligence.apds.availability.AVAILABLE': 'Shadow důkazy k dispozici',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'APDS shadow pro tento rozsah neaktivní',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'Žádná zachycená rozhodnutí reconciliace',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Uložená historie nedostupná',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Neúplné důkazy pro tento rozsah',
  'master.intelligence.apds.realPoll.NOT_LINKED': 'Nepřipojeno k reálnému pollu',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Připojeno — log pollu neověřen',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Připojeno — zaznamenán úspěch',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Připojeno — stav bez úspěchu',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Důkaz reálného pollu nedostupný',
  'master.intelligence.pdi.loading': 'Načítání intelligence zařízení…',
  'master.intelligence.pdi.error': 'PDI device intelligence se nepodařilo načíst.',
  'master.intelligence.pdi.section.identity': 'Shrnutí identity',
  'master.intelligence.pdi.section.timeline': 'Časová osa',
  'master.intelligence.pdi.section.episodes': 'Epizody připojení',
  'master.intelligence.pdi.section.drift': 'Monitoring identity',
  'master.intelligence.pdi.snapshotNotHistory': 'Aktuální stav a live mirror jsou snímky — ne plná historie.',
  'master.intelligence.pdi.notApplicableR1': 'Fyzický R1 monitoring neplatí (např. softwarová Tesla).',
  'master.intelligence.pdi.noDriftHistory': 'Bez persistované historie driftu. Chybějící záznamy nejsou důkazem bez driftu.',
  'master.intelligence.pdi.episodeNotPoll': 'Epizody připojení jsou persistovaná lifecycle evidencia — ne APDS poll.',
  'master.intelligence.pdi.noEpisodes': 'Žádné epizody pro aktuální rozsah vozidla.',
  'master.intelligence.pdi.emptyTimeline': 'Žádné položky v persistované timeline.',
  'master.intelligence.pdi.evaluatedAt': 'Evidence vyhodnocena',
  'master.intelligence.section.context': 'Kontext URL',
  'master.intelligence.section.crossLinks': 'Přechody',
  'master.intelligence.section.previewComponents': 'Náhled prezentace (ne živá data)',
  'master.intelligence.section.evidenceSemantics': 'Význam důkazů',
  'master.intelligence.url.invalidParams': 'Ignorované neplatné parametry URL: {{params}}',
  'master.intelligence.vsi.previewNote':
    'Odznaky ukazují jen sémantiku backendových štítků. V PR1 se nenačítají produkční data.',
  'master.intelligence.vsi.empty.title': 'Read API zatím nepropojena',
  'master.intelligence.vsi.empty.body':
    'PR2 načte profily signálů vozidla, historii revizí a vysvětlení resolveru přes read-only endpointy.',
  'master.intelligence.apds.empty.title': 'Read API zatím nepropojena',
  'master.intelligence.apds.empty.body':
    'PR3 načte shadow rozhodnutí, epochy aktivace a korelaci VSI. Shadow řádky nejsou vykonané polly.',
  'master.intelligence.crossLink.vehicle': 'Otevřít vozidlo',
  'master.intelligence.crossLink.device': 'Otevřít inventář zařízení',
  'master.intelligence.crossLink.vsi': 'Otevřít VSI',
  'master.intelligence.crossLink.apds': 'Otevřít APDS',
  'master.intelligence.crossLink.contextMissing': 'Odkaz na {{target}} vyžaduje více kontextu v URL (PR2/PR3).',
  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8 h pozorováno',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24 h pozorováno',
  'master.intelligence.badge.lv.UNKNOWN': 'LV neznámé',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Pozorovaný standby přenos zhruba každých 8 hodin (ne potvrzená hardwarová konfigurace).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Pozorovaný standby přenos zhruba každých 24 hodin (ne potvrzená hardwarová konfigurace).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Nedostatečné nebo blokované důkazy standby přenosu.',
  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM vysoká frekvence (empiricky)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standard (empiricky)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM neznámé',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Empiricky klasifikovaný profil RPM s vysokou frekvencí. Není důkaz nativního vzorkování 1 Hz.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD': 'Empiricky klasifikovaná standardní hustota pozorování RPM.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Nedostatečné důkazy kadence RPM pro stabilní štítek.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'Profil RPM spalovacího motoru neplatí (např. BEV). To není totéž jako neznámá kvalita signálu.',
  'master.intelligence.badge.limitation': 'Omezení backendu: {{code}}',
  'master.intelligence.confidence.HIGH': 'Spolehlivost: vysoká',
  'master.intelligence.confidence.MEDIUM': 'Spolehlivost: střední',
  'master.intelligence.confidence.LOW': 'Spolehlivost: nízká',
  'master.intelligence.confidence.UNKNOWN': 'Spolehlivost: neznámá',
  'master.intelligence.density.SUB_ONE_HZ': 'Hustota: pod 1 Hz',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Hustota: 1s buckety neprokázány',
  'master.intelligence.density.IRREGULAR': 'Hustota: nepravidelná',
  'master.intelligence.density.UNKNOWN': 'Hustota: neznámá',
  'master.intelligence.density.NOT_APPLICABLE': 'Hustota: neplatí',
  'master.intelligence.evidence.title': 'Časové značky důkazů',
  'master.intelligence.evidence.evaluatedAt': 'Vyhodnoceno',
  'master.intelligence.evidence.providerSourceTimestamp': 'Čas zdroje poskytovatele',
  'master.intelligence.evidence.providerFetchedAt': 'Čas stažení u poskytovatele',
  'master.intelligence.evidence.profileRevision': 'Revize profilu',
  'master.intelligence.evidence.fetchNotSignalProof':
    'Čas stažení je ingest SynqDrive — ne důkaz nového signálu od poskytovatele.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'Shadow rozhodnutí APDS popisují simulovanou reconciliaci, pokud není propojeno ID reálného pollu.',
  'master.intelligence.evidence.kind.observed': 'Druh: pozorovaný důkaz poskytovatele',
  'master.intelligence.evidence.kind.simulated_shadow': 'Druh: simulace / shadow vyhodnocení',
  'master.intelligence.evidence.kind.verified_real_execution': 'Druh: ověřené provedení pollu',
  'master.intelligence.evidence.kind.not_available': 'Druh: nedostupné',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Druh: nedostatečné důkazy',
  'master.intelligence.evidence.kind.not_applicable': 'Druh: neplatí',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Druh: vyhodnocení blokováno',
  'master.intelligence.blocked.title': 'Vyhodnocení blokováno',
  'master.intelligence.blocked.body':
    'Klasifikace profilu pozastavena ({{code}}). Starší štítek nesmí být zobrazen jako aktuální.',

  'master.intelligence.section.fleetOverview': 'Rozsah flotily a profily',
  'master.intelligence.section.signals': 'Detail signálu',
  'master.intelligence.section.revisions': 'Historie revizí profilu',
  'master.intelligence.section.capability': 'Capability resolver (pouze čtení)',

  'master.intelligence.vsi.picker.org': 'Organizace',
  'master.intelligence.vsi.picker.vehicle': 'Vozidlo',
  'master.intelligence.vsi.picker.link': 'Provider source link',
  'master.intelligence.vsi.loading': 'Načítání VSI modelů…',
  'master.intelligence.vsi.error': 'VSI data se nepodařilo načíst.',
  'master.intelligence.vsi.retry': 'Zkusit znovu',

  'master.intelligence.vsi.empty.selectScope.title': 'Vyberte organizaci a vozidlo',
  'master.intelligence.vsi.empty.selectScope.body':
    'Vyberte organizaci a vozidlo pro načtení uložených VSI profilů. Rozsah ověřuje server.',

  'master.intelligence.vsi.noProfiles.title': 'Žádné materializované VSI profily',
  'master.intelligence.vsi.noProfiles.body':
    'Pro toto vozidlo zatím neexistuje capability profil. To není totéž jako vypnutá historie revizí.',

  'master.intelligence.vsi.decision.lv': 'LV rozhodovací kód: {{code}}',
  'master.intelligence.vsi.decision.rpm': 'RPM rozhodovací kód: {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Cadence štítky popisují pozorované vzory přenosu, ne nativní konfiguraci hardwaru.',
  'master.intelligence.vsi.signals.canonical': 'Kanonický signál',
  'master.intelligence.vsi.signals.provider': 'Název u providera',
  'master.intelligence.vsi.signals.quality': 'Kvalita / jistota',
  'master.intelligence.vsi.signals.observedAt': 'Poslední pozorování (UTC + místní)',
  'master.intelligence.vsi.signals.limitations': 'Omezení',
  'master.intelligence.vsi.signals.empirical.NOT_APPLICABLE': 'Neplatí (pohon)',
  'master.intelligence.vsi.signals.empirical.NEVER_OBSERVED': 'Nikdy pozorováno',
  'master.intelligence.vsi.signals.empirical.OBSERVED': 'Pozorováno',
  'master.intelligence.vsi.signals.empirical.OBSERVED_STALE': 'Pozorováno (zastaralé)',

  'master.intelligence.vsi.signals.rpmCombined.heading': 'Kombinovaná dostupnost RPM (odvozená)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_LIVE': 'Prokázáno live (čerstvý snapshot)',
  'master.intelligence.vsi.signals.rpmCombined.PROVEN_HISTORICAL_ONLY':
    'Pouze historicky prokázáno (HF kadence; snapshot není live)',
  'master.intelligence.vsi.signals.rpmCombined.NOT_PROVEN': 'Neprokázáno',
  'master.intelligence.vsi.signals.rpmCombined.NOT_APPLICABLE': 'Neplatí (pohon)',
  'master.intelligence.vsi.signals.rpmCombined.attributionLimited':
    'HF evidence není přiřazena k tomuto source link',

  'master.intelligence.vsi.signals.rpmDual.intro':
    'Otáčky motoru (RPM) používají dvě oddělené vrstvy evidence. Stav snímku pochází z nejnovějšího balíčku vehicle latest state; HF/kadence z mirrorovaných HF bodů a dokončených jízd. Nejsou zaměnitelné.',
  'master.intelligence.vsi.signals.rpmDual.snapshotHeading': 'Snímek (vehicle latest state)',
  'master.intelligence.vsi.signals.rpmDual.snapshotWindow':
    'Okno pozorování: nejnovější přiřazený provider bundle při materializaci profilu (ne HF historie).',
  'master.intelligence.vsi.signals.rpmDual.cadenceHeading': 'HF / kadence (okna jízd)',
  'master.intelligence.vsi.signals.rpmDual.cadenceWindow':
    'Okno pozorování: obohacení HF kadence v rozsahu linku (typicky až 14 dní dokončených jízd).',
  'master.intelligence.vsi.signals.rpmDual.empirical': 'Empirické pozorování',
  'master.intelligence.vsi.signals.rpmDual.freshness': 'Čerstvost',
  'master.intelligence.vsi.signals.rpmDual.lastValid': 'Poslední platné pozorování',
  'master.intelligence.vsi.signals.rpmDual.quality': 'Kvalita / jistota',
  'master.intelligence.vsi.signals.rpmDual.provenance': 'Původ',
  'master.intelligence.vsi.signals.rpmDual.observedSamples': 'Počet HF vzorků',
  'master.intelligence.vsi.signals.rpmDual.activeProfile': 'Aktivní RPM profil',
  'master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt': 'Profil vyhodnocen',
  'master.intelligence.vsi.signals.rpmDual.finalizedTrips': 'Dokončené jízdy v okně kadence',
  'master.intelligence.vsi.signals.rpmDual.decision': 'Rozhodnutí klasifikace',
  'master.intelligence.vsi.signals.rpmDual.tripSupport': 'Podpůrné klasifikace jízd',
  'master.intelligence.vsi.signals.rpmDual.notApplicable':
    'Klasifikace kadence RPM pro tento pohon neplatí (např. BEV).',
  'master.intelligence.vsi.signals.rpmDual.noHfEvidence':
    'V persistovaném profilu chybí HF kadence (chybí nebo prázdné cadenceIntelligence).',
  'master.intelligence.vsi.signals.rpmDual.snapshotShort': 'Snímek',
  'master.intelligence.vsi.signals.rpmDual.cadenceShort': 'HF/kadence',
  'master.intelligence.vsi.signals.rpmDual.hfEvidenceLine':
    'Profil {{profile}} · {{samples}} HF vzorků (viz panel)',
  'master.intelligence.vsi.signals.rpmDual.seePanel': 'Viz panel níže',

  'master.intelligence.vsi.revision.loading': 'Načítání historie revizí…',
  'master.intelligence.vsi.revision.loadError': 'Historii revizí se nepodařilo načíst.',
  'master.intelligence.vsi.revision.retry': 'Opakovat načtení historie revizí',
  'master.intelligence.vsi.revision.notCaptured': 'Historie revizí: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'Záznam P5-H1 je vypnutý. Chybějící historie neznamená, že se profil neměnil.',
  'master.intelligence.vsi.revision.moreAvailable': 'Další revize — stránkování kurzorem přes API.',

  'master.intelligence.vsi.asOf.title': 'As-of rozlišení revize',
  'master.intelligence.vsi.asOf.decisionAt': 'Čas rozhodnutí',
  'master.intelligence.vsi.asOf.authority': 'Autorita',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master Intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'Souhrny pouze ke čtení z API VSI, APDS a PDI. Štítky odrážejí pozorované nebo persistované důkazy — ne hardware důkaz.',
  'master.intelligence.vehicleDetail.loading': 'Načítání souhrnů intelligence…',
  'master.intelligence.vehicleDetail.error': 'Souhrny intelligence pro toto vozidlo se nepodařilo načíst.',
  'master.intelligence.vehicleDetail.openVsi': 'Otevřít detail VSI',
  'master.intelligence.vehicleDetail.openApds': 'Otevřít detail APDS',
  'master.intelligence.vehicleDetail.openPdi': 'Otevřít detail zařízení',
  'master.intelligence.vehicleDetail.noApdsDecision': 'V rozsahu není persistované rozhodnutí.',
  'master.intelligence.vehicleDetail.noPhysicalDevice':
    'Tomuto vozidlu není přiřazeno jediné nainstalované fyzické zařízení.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Více provider source linků — zobrazen primární link; ověřte link ve VSI/APDS před předpoklady napříč vozidly.',
} as const;
