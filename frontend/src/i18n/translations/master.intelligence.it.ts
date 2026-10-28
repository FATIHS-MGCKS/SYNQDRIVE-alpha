export const masterIntelligenceIt = {
  'master.nav.vsiIntelligence': 'VSI – intelligence segnale',
  'master.nav.apdsIntelligence': 'APDS – polling adattivo',
  'master.intelligence.vsi.title': 'VSI – intelligence segnale',
  'master.intelligence.vsi.description':
    'Profili segnale in sola lettura, cadenza osservata e prove di valutazione. Dati live in PR2.',
  'master.intelligence.apds.title': 'APDS – polling adattivo',
  'master.intelligence.apds.description':
    'Decisioni shadow di riconciliazione e prove di poll reale collegate. Storico in PR3.',
  'master.intelligence.section.context': 'Contesto URL',
  'master.intelligence.section.crossLinks': 'Collegamenti incrociati',
  'master.intelligence.section.previewComponents': 'Anteprima presentazione (nessun dato live)',
  'master.intelligence.section.evidenceSemantics': 'Semantica delle prove',
  'master.intelligence.url.invalidParams': 'Parametri URL non validi ignorati: {{params}}',
  'master.intelligence.vsi.previewNote':
    'I badge mostrano solo la semantica delle etichette backend. Nessun dato di produzione in PR1.',
  'master.intelligence.vsi.empty.title': 'API di lettura non ancora collegate',
  'master.intelligence.vsi.empty.body':
    'PR2 caricherà profili segnale veicolo, storico revisioni e spiegazioni resolver via endpoint read-only.',
  'master.intelligence.apds.empty.title': 'API di lettura non ancora collegate',
  'master.intelligence.apds.empty.body':
    'PR3 caricherà decisioni shadow, epoche di attivazione e correlazione VSI. Le righe shadow non sono poll eseguiti.',
  'master.intelligence.crossLink.vehicle': 'Apri veicolo',
  'master.intelligence.crossLink.device': 'Apri inventario dispositivi',
  'master.intelligence.crossLink.vsi': 'Apri VSI',
  'master.intelligence.crossLink.apds': 'Apri APDS',
  'master.intelligence.crossLink.contextMissing':
    'Il link a {{target}} richiede più contesto nell’URL (PR2/PR3).',
  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8 h osservato',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24 h osservato',
  'master.intelligence.badge.lv.UNKNOWN': 'LV sconosciuto',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Trasmissione standby osservata circa ogni 8 ore (non configurazione hardware confermata).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Trasmissione standby osservata circa ogni 24 ore (non configurazione hardware confermata).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Prove di trasmissione standby insufficienti o bloccate.',
  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM alta frequenza (empirico)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standard (empirico)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM sconosciuto',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Profilo RPM ad alta frequenza classificato empiricamente. Non prova di campionamento nativo a 1 Hz.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD': 'Densità RPM standard classificata empiricamente.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Prove di cadenza RPM insufficienti per un’etichetta stabile.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'Profilo RPM ICE non applicabile (es. BEV). Non equivale a qualità segnale sconosciuta.',
  'master.intelligence.badge.limitation': 'Limitazione backend: {{code}}',
  'master.intelligence.confidence.HIGH': 'Confidenza: alta',
  'master.intelligence.confidence.MEDIUM': 'Confidenza: media',
  'master.intelligence.confidence.LOW': 'Confidenza: bassa',
  'master.intelligence.confidence.UNKNOWN': 'Confidenza: sconosciuta',
  'master.intelligence.density.SUB_ONE_HZ': 'Densità: sotto 1 Hz',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Densità: bucket 1 s non provati',
  'master.intelligence.density.IRREGULAR': 'Densità: irregolare',
  'master.intelligence.density.UNKNOWN': 'Densità: sconosciuta',
  'master.intelligence.density.NOT_APPLICABLE': 'Densità: non applicabile',
  'master.intelligence.evidence.title': 'Timestamp delle prove',
  'master.intelligence.evidence.evaluatedAt': 'Valutato il',
  'master.intelligence.evidence.providerSourceTimestamp': 'Ora sorgente provider',
  'master.intelligence.evidence.providerFetchedAt': 'Ora fetch provider',
  'master.intelligence.evidence.profileRevision': 'Revisione profilo',
  'master.intelligence.evidence.fetchNotSignalProof':
    'L’ora di fetch è ingest SynqDrive — non prova di un nuovo segnale provider.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'Le decisioni shadow APDS descrivono riconciliazione simulata salvo ID poll reale collegato.',
  'master.intelligence.evidence.kind.observed': 'Tipo: prova provider osservata',
  'master.intelligence.evidence.kind.simulated_shadow': 'Tipo: valutazione simulata / shadow',
  'master.intelligence.evidence.kind.verified_real_execution': 'Tipo: esecuzione poll reale verificata',
  'master.intelligence.evidence.kind.not_available': 'Tipo: non disponibile',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Tipo: prove insufficienti',
  'master.intelligence.evidence.kind.not_applicable': 'Tipo: non applicabile',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Tipo: valutazione bloccata',
  'master.intelligence.blocked.title': 'Valutazione bloccata',
  'master.intelligence.blocked.body':
    'Classificazione profilo in pausa ({{code}}). Un’etichetta precedente non deve essere mostrata come attuale.',
} as const;
