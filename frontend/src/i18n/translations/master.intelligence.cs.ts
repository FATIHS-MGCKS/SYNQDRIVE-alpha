export const masterIntelligenceCs = {
  'master.nav.vsiIntelligence': 'VSI – inteligence signálů',
  'master.nav.apdsIntelligence': 'APDS – adaptivní polling',
  'master.intelligence.vsi.title': 'VSI – inteligence signálů',
  'master.intelligence.vsi.description':
    'Profily signálů pouze ke čtení, pozorovaná kadence a důkazy vyhodnocení. Živá data v PR2.',
  'master.intelligence.apds.title': 'APDS – adaptivní polling',
  'master.intelligence.apds.description':
    'Shadow rozhodnutí reconciliace a propojené důkazy reálného pollu. Historie v PR3.',
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
} as const;
