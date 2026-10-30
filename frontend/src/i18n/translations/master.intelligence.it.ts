export const masterIntelligenceIt = {
  'master.nav.vsiIntelligence': 'VSI – intelligence segnale',
  'master.nav.apdsIntelligence': 'APDS – polling adattivo',
  'master.intelligence.vsi.title': 'VSI – intelligence segnale',
  'master.intelligence.vsi.description':
    'Profili segnale veicolo in sola lettura, cadenza osservata, storico revisioni se catturato e spiegazioni capability resolver dai dati di produzione.',
  'master.intelligence.apds.title': 'APDS – polling adattivo',
  'master.intelligence.apds.description':
    'Decisioni shadow di riconciliazione in sola lettura, cronologia epoche, prove di poll reale se collegate e correlazione VSI storica. I next poll simulati non sono poll eseguiti.',

  'master.intelligence.apds.loading': 'Caricamento modelli di lettura APDS…',
  'master.intelligence.apds.error': 'Impossibile caricare l’intelligence APDS.',
  'master.intelligence.apds.latestDecision': 'Ultima decisione persistita',
  'master.intelligence.apds.activeEpoch': 'Epoca attiva',
  'master.intelligence.apds.decisionsForVehicle': 'decisioni per questo veicolo nell’epoca',
  'master.intelligence.apds.shadowNotReal':
    'Le raccomandazioni shadow e i timestamp di next poll simulato non provano un poll reale pianificato o eseguito.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'La correlazione VSI storica è evidenza di ricerca — non ha necessariamente guidato questa decisione APDS a runtime.',
  'master.intelligence.apds.openVsiAsOf': 'Apri VSI con ora as-of della decisione',
  'master.intelligence.apds.empty.selectScope.title': 'Seleziona organizzazione e veicolo',
  'master.intelligence.apds.empty.selectScope.body':
    'Scegli l’ambito per caricare decisioni shadow ed epoche persistite. Il link sorgente provider abilita la correlazione VSI; ambito validato lato server.',
  'master.intelligence.apds.section.epochs': 'Cronologia epoche di attivazione',
  'master.intelligence.apds.section.decisions': 'Esploratore decisioni',
  'master.intelligence.apds.section.detail': 'Dettaglio decisione',
  'master.intelligence.apds.col.time': 'Ora decisione',
  'master.intelligence.apds.col.reason': 'Motivo',
  'master.intelligence.apds.col.policy': 'Policy',
  'master.intelligence.apds.col.realPoll': 'Collegamento poll reale',
  'master.intelligence.apds.detail.shadow': 'Raccomandazione shadow (output persistiti)',
  'master.intelligence.apds.detail.realPoll': 'Evidenza poll reale',
  'master.intelligence.apds.detail.vsiCorrelation': 'Correlazione VSI storica',
  'master.intelligence.apds.availability.AVAILABLE': 'Evidenza shadow disponibile',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'Shadow APDS non attivo per questo ambito',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'Nessuna decisione di riconciliazione catturata',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Storico persistito non disponibile',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Evidenza incompleta per questo ambito',
  'master.intelligence.apds.realPoll.NOT_LINKED': 'Non collegato a poll reale',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Collegato — log poll non verificato',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Collegato — successo registrato',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Collegato — stato senza successo',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Evidenza poll reale non disponibile',
  'master.intelligence.pdi.loading': 'Caricamento intelligence dispositivo…',
  'master.intelligence.pdi.error': 'Impossibile caricare l’intelligence PDI.',
  'master.intelligence.pdi.section.identity': 'Riepilogo identità',
  'master.intelligence.pdi.section.timeline': 'Timeline cronologica',
  'master.intelligence.pdi.section.episodes': 'Episodi di connessione',
  'master.intelligence.pdi.section.drift': 'Monitoraggio identità',
  'master.intelligence.pdi.snapshotNotHistory': 'Inventario attuale e mirror live sono snapshot, non storico completo.',
  'master.intelligence.pdi.notApplicableR1': 'Monitoraggio R1 fisico non applicabile (es. Tesla solo software).',
  'master.intelligence.pdi.noDriftHistory': 'Nessuna cronologia drift persistita. Assenza record ≠ nessun drift.',
  'master.intelligence.pdi.episodeNotPoll': 'Episodi connessione = evidenza lifecycle persistita, non poll APDS.',
  'master.intelligence.pdi.noEpisodes': 'Nessun episodio per l’ambito veicolo corrente.',
  'master.intelligence.pdi.emptyTimeline': 'Nessuna voce timeline persistita.',
  'master.intelligence.pdi.evaluatedAt': 'Evidenza valutata',
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

  'master.intelligence.section.fleetOverview': 'Ambito flotta e profili',
  'master.intelligence.section.signals': 'Dettaglio segnale',
  'master.intelligence.section.revisions': 'Cronologia revisioni profilo',
  'master.intelligence.section.capability': 'Capability resolver (sola lettura)',

  'master.intelligence.vsi.picker.org': 'Organizzazione',
  'master.intelligence.vsi.picker.vehicle': 'Veicolo',
  'master.intelligence.vsi.picker.link': 'Link sorgente provider',
  'master.intelligence.vsi.loading': 'Caricamento modelli VSI…',
  'master.intelligence.vsi.error': 'Impossibile caricare l’intelligence VSI.',
  'master.intelligence.vsi.retry': 'Riprova',

  'master.intelligence.vsi.empty.selectScope.title': 'Seleziona organizzazione e veicolo',
  'master.intelligence.vsi.empty.selectScope.body':
    'Scegli organizzazione e veicolo per caricare i profili VSI persistiti. L’ambito è validato lato server.',

  'master.intelligence.vsi.noProfiles.title': 'Nessun profilo VSI materializzato',
  'master.intelligence.vsi.noProfiles.body':
    'Non esiste ancora un profilo capability per questo veicolo. Non equivale a cronologia revisioni disabilitata.',

  'master.intelligence.vsi.decision.lv': 'Codice decisione LV: {{code}}',
  'master.intelligence.vsi.decision.rpm': 'Codice decisione RPM: {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Le etichette di cadenza descrivono pattern di trasmissione osservati, non la configurazione hardware nativa.',
  'master.intelligence.vsi.signals.canonical': 'Segnale canonico',
  'master.intelligence.vsi.signals.provider': 'Nome provider',
  'master.intelligence.vsi.signals.quality': 'Qualità / fiducia',
  'master.intelligence.vsi.signals.observedAt': 'Ultima osservazione (UTC + locale)',
  'master.intelligence.vsi.signals.limitations': 'Limitazioni',
  'master.intelligence.vsi.signals.empirical.NOT_APPLICABLE': 'Non applicabile (powertrain)',
  'master.intelligence.vsi.signals.empirical.NEVER_OBSERVED': 'Mai osservato',
  'master.intelligence.vsi.signals.empirical.OBSERVED': 'Osservato',
  'master.intelligence.vsi.signals.empirical.OBSERVED_STALE': 'Osservato (obsoleto)',

  'master.intelligence.vsi.signals.rpmDual.intro':
    'Il regime motore (RPM) usa due piani di evidenza separati. Lo stato snapshot proviene dall’ultimo bundle vehicle latest state; HF/cadenza dai punti ad alta frequenza mirrorati e dai viaggi finalizzati. Non sono intercambiabili.',
  'master.intelligence.vsi.signals.rpmDual.snapshotHeading': 'Snapshot (vehicle latest state)',
  'master.intelligence.vsi.signals.rpmDual.snapshotWindow':
    'Finestra di osservazione: ultimo bundle provider attribuito alla materializzazione del profilo (non storico HF).',
  'master.intelligence.vsi.signals.rpmDual.cadenceHeading': 'HF / cadenza (finestre viaggio)',
  'master.intelligence.vsi.signals.rpmDual.cadenceWindow':
    'Finestra di osservazione: arricchimento cadenza HF legato al link (fino a 14 giorni di viaggi finalizzati).',
  'master.intelligence.vsi.signals.rpmDual.empirical': 'Osservazione empirica',
  'master.intelligence.vsi.signals.rpmDual.freshness': 'Freschezza',
  'master.intelligence.vsi.signals.rpmDual.lastValid': 'Ultima osservazione valida',
  'master.intelligence.vsi.signals.rpmDual.quality': 'Qualità / confidenza',
  'master.intelligence.vsi.signals.rpmDual.provenance': 'Provenienza',
  'master.intelligence.vsi.signals.rpmDual.observedSamples': 'Conteggio campioni HF',
  'master.intelligence.vsi.signals.rpmDual.activeProfile': 'Profilo RPM attivo',
  'master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt': 'Profilo valutato il',
  'master.intelligence.vsi.signals.rpmDual.finalizedTrips': 'Viaggi finalizzati nella finestra cadenza',
  'master.intelligence.vsi.signals.rpmDual.decision': 'Decisione di classificazione',
  'master.intelligence.vsi.signals.rpmDual.tripSupport': 'Classificazioni viaggio di supporto',
  'master.intelligence.vsi.signals.rpmDual.notApplicable':
    'La classificazione cadenza RPM non si applica a questo powertrain (es. BEV).',
  'master.intelligence.vsi.signals.rpmDual.noHfEvidence':
    'Nessuna evidenza HF cadenza nel profilo persistito (cadenceIntelligence assente o vuoto).',
  'master.intelligence.vsi.signals.rpmDual.snapshotShort': 'Snapshot',
  'master.intelligence.vsi.signals.rpmDual.cadenceShort': 'HF/cadenza',
  'master.intelligence.vsi.signals.rpmDual.hfEvidenceLine':
    'Profilo {{profile}} · {{samples}} campioni HF (vedi pannello)',
  'master.intelligence.vsi.signals.rpmDual.seePanel': 'Vedi pannello sotto',

  'master.intelligence.vsi.revision.loading': 'Caricamento cronologia revisioni…',
  'master.intelligence.vsi.revision.loadError': 'Impossibile caricare la cronologia delle revisioni.',
  'master.intelligence.vsi.revision.retry': 'Riprova cronologia revisioni',
  'master.intelligence.vsi.revision.notCaptured': 'Cronologia: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'La cattura P5-H1 è disabilitata. La mancanza di cronologia non significa assenza di modifiche al profilo.',
  'master.intelligence.vsi.revision.moreAvailable': 'Altre revisioni — paginazione a cursore via API.',

  'master.intelligence.vsi.asOf.title': 'Risoluzione revisione as-of',
  'master.intelligence.vsi.asOf.decisionAt': 'Ora decisione',
  'master.intelligence.vsi.asOf.authority': 'Autorita',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master Intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'Riepiloghi in sola lettura dalle API VSI, APDS e PDI. Le etichette riflettono evidenze osservate o persistite — non prova hardware.',
  'master.intelligence.vehicleDetail.loading': 'Caricamento riepiloghi intelligence…',
  'master.intelligence.vehicleDetail.error': 'Impossibile caricare i riepiloghi intelligence per questo veicolo.',
  'master.intelligence.vehicleDetail.openVsi': 'Apri dettaglio VSI',
  'master.intelligence.vehicleDetail.openApds': 'Apri dettaglio APDS',
  'master.intelligence.vehicleDetail.openPdi': 'Apri dettaglio dispositivo',
  'master.intelligence.vehicleDetail.noApdsDecision': 'Nessuna decisione persistita nell’ambito.',
  'master.intelligence.vehicleDetail.noPhysicalDevice':
    'Nessun singolo dispositivo fisico installato attribuito a questo veicolo.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Più link sorgente provider — mostrato il link primario; confermare il link in VSI/APDS prima di ipotesi cross-veicolo.',
} as const;
