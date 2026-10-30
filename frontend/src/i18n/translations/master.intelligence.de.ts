export const masterIntelligenceDe = {
  'master.nav.vsiIntelligence': 'VSI – Signal Intelligence',
  'master.nav.apdsIntelligence': 'APDS – Adaptives Polling',

  'master.intelligence.vsi.title': 'VSI – Signal Intelligence',
  'master.intelligence.vsi.description':
    'Schreibgeschützte Fahrzeug-Signalprofile, beobachtete Übertragungs-Cadence, Revisionshistorie (falls erfasst) und Capability-Resolver-Erklärungen aus Produktionsdaten.',
  'master.intelligence.apds.title': 'APDS – Adaptives Polling',
  'master.intelligence.apds.description':
    'Schreibgeschützte Shadow-Abgleichsentscheidungen, Epochenhistorie, echte Poll-Evidenz (wenn verknüpft) und historische VSI-Korrelation. Simulierte Next-Poll-Zeiten sind keine ausgeführten Polls.',

  'master.intelligence.apds.loading': 'APDS-Lesemodelle werden geladen…',
  'master.intelligence.apds.error': 'APDS-Intelligence konnte nicht geladen werden.',
  'master.intelligence.apds.latestDecision': 'Letzte persistierte Entscheidung',
  'master.intelligence.apds.activeEpoch': 'Aktive Epoche',
  'master.intelligence.apds.decisionsForVehicle': 'Entscheidungen für dieses Fahrzeug in der Epoche',
  'master.intelligence.apds.shadowNotReal':
    'Shadow-Empfehlungen und simulierte Next-Poll-Zeitstempel sind kein Nachweis für einen geplanten oder ausgeführten echten Poll.',
  'master.intelligence.apds.vsiNotRuntimeDriver':
    'Historische VSI-Korrelation ist Forschungsevidenz — sie hat diese APDS-Entscheidung zur Laufzeit nicht zwingend bestimmt.',
  'master.intelligence.apds.openVsiAsOf': 'VSI mit Entscheidungs-as-of-Zeit öffnen',
  'master.intelligence.apds.empty.selectScope.title': 'Organisation und Fahrzeug wählen',
  'master.intelligence.apds.empty.selectScope.body':
    'Scope wählen, um persistierte Shadow-Entscheidungen und Epochen zu laden. Provider-Quell-Link ermöglicht VSI-Korrelation; Scope wird serverseitig geprüft.',
  'master.intelligence.apds.section.epochs': 'Aktivierungs-Epochen-Timeline',
  'master.intelligence.apds.section.decisions': 'Entscheidungs-Explorer',
  'master.intelligence.apds.section.detail': 'Entscheidungsdetail',
  'master.intelligence.apds.col.time': 'Entscheidungszeit',
  'master.intelligence.apds.col.reason': 'Grund',
  'master.intelligence.apds.col.policy': 'Policy',
  'master.intelligence.apds.col.realPoll': 'Echter Poll-Link',
  'master.intelligence.apds.detail.shadow': 'Shadow-Empfehlung (persistierte Outputs)',
  'master.intelligence.apds.detail.realPoll': 'Echte Poll-Evidenz',
  'master.intelligence.apds.detail.vsiCorrelation': 'Historische VSI-Korrelation',
  'master.intelligence.apds.availability.AVAILABLE': 'Shadow-Evidenz verfügbar',
  'master.intelligence.apds.availability.NOT_ACTIVATED': 'APDS-Shadow für diesen Scope nicht aktiviert',
  'master.intelligence.apds.availability.NO_DECISIONS_CAPTURED': 'Keine Abgleichsentscheidungen erfasst',
  'master.intelligence.apds.availability.HISTORY_UNAVAILABLE': 'Persistierte Historie nicht verfügbar',
  'master.intelligence.apds.availability.EVIDENCE_INCOMPLETE': 'Evidenz für diesen Scope unvollständig',
  'master.intelligence.apds.realPoll.NOT_LINKED': 'Nicht mit echtem Poll verknüpft',
  'master.intelligence.apds.realPoll.LINKED_UNVERIFIED': 'Verknüpft — Poll-Log nicht verifiziert',
  'master.intelligence.apds.realPoll.LINKED_SUCCESS': 'Verknüpft — Erfolg erfasst',
  'master.intelligence.apds.realPoll.LINKED_NON_SUCCESS': 'Verknüpft — Status ohne Erfolg',
  'master.intelligence.apds.realPoll.NOT_AVAILABLE': 'Echte Poll-Evidenz nicht verfügbar',

  'master.intelligence.pdi.loading': 'Geräte-Intelligence wird geladen…',
  'master.intelligence.pdi.error': 'PDI-Geräte-Intelligence konnte nicht geladen werden.',
  'master.intelligence.pdi.section.identity': 'Identitätsübersicht',
  'master.intelligence.pdi.section.timeline': 'Chronologische Timeline',
  'master.intelligence.pdi.section.episodes': 'Verbindungs-Episoden',
  'master.intelligence.pdi.section.drift': 'Identitäts-Monitoring',
  'master.intelligence.pdi.snapshotNotHistory':
    'Aktueller Bestand und Live-Spiegel sind Momentaufnahmen — keine vollständige Historie.',
  'master.intelligence.pdi.notApplicableR1':
    'Physisches Ruptela-R1-Monitoring gilt nicht (z. B. reine Software/Tesla-Integration).',
  'master.intelligence.pdi.noDriftHistory':
    'Keine persistierte Drift-Ereignishistorie. Fehlende Einträge beweisen kein „kein Drift“.',
  'master.intelligence.pdi.episodeNotPoll':
    'Verbindungs-Episoden sind persistierte Lifecycle-Evidenz — keine APDS-Poll-Ausführung.',
  'master.intelligence.pdi.noEpisodes': 'Keine Episoden für den aktuellen Fahrzeug-Scope.',
  'master.intelligence.pdi.emptyTimeline': 'Keine Timeline-Einträge in persistierter Historie.',
  'master.intelligence.pdi.evaluatedAt': 'Evidenz bewertet',

  'master.intelligence.section.context': 'URL-Kontext',
  'master.intelligence.section.crossLinks': 'Querverweise',
  'master.intelligence.section.previewComponents': 'Darstellungsvorschau (keine Live-Daten)',
  'master.intelligence.section.evidenceSemantics': 'Evidenz-Bedeutung',

  'master.intelligence.url.invalidParams': 'Ungültige URL-Parameter ignoriert: {{params}}',

  'master.intelligence.vsi.previewNote':
    'Die Badges zeigen nur die Bedeutung der Backend-Labels. In PR1 werden keine Produktionsdaten geladen.',
  'master.intelligence.vsi.empty.title': 'Lese-APIs noch nicht angebunden',
  'master.intelligence.vsi.empty.body':
    'PR2 lädt Fahrzeug-Signalprofile, Revisionshistorie (falls erfasst) und Capability-Resolver-Erklärungen über schreibgeschützte Backend-Endpunkte.',

  'master.intelligence.apds.empty.title': 'Lese-APIs noch nicht angebunden',
  'master.intelligence.apds.empty.body':
    'PR3 lädt Shadow-Entscheidungen, Aktivierungs-Epochen und VSI-Korrelation. Shadow-Zeilen werden nie als ausgeführte Polls dargestellt.',

  'master.intelligence.crossLink.vehicle': 'Fahrzeug öffnen',
  'master.intelligence.crossLink.device': 'Geräte-Inventar öffnen',
  'master.intelligence.crossLink.vsi': 'VSI öffnen',
  'master.intelligence.crossLink.apds': 'APDS öffnen',
  'master.intelligence.crossLink.contextMissing':
    'Link zu {{target}} benötigt mehr Kontext in der URL (PR2/PR3).',

  'master.intelligence.badge.lv.LV_8H_OBSERVED': 'LV ~8h beobachtet',
  'master.intelligence.badge.lv.LV_24H_OBSERVED': 'LV ~24h beobachtet',
  'master.intelligence.badge.lv.UNKNOWN': 'LV unbekannt',
  'master.intelligence.badge.lv.explain.LV_8H_OBSERVED':
    'Beobachtete Standby-Übertragung mit etwa 8 Stunden Abstand (keine bestätigte Hardware-Konfiguration).',
  'master.intelligence.badge.lv.explain.LV_24H_OBSERVED':
    'Beobachtete Standby-Übertragung mit etwa 24 Stunden Abstand (keine bestätigte Hardware-Konfiguration).',
  'master.intelligence.badge.lv.explain.UNKNOWN': 'Unzureichende oder blockierte Standby-Übertragungs-Evidenz.',

  'master.intelligence.badge.rpm.RPM_1HZ': 'RPM hochfrequent (empirisch)',
  'master.intelligence.badge.rpm.RPM_STANDARD': 'RPM standard (empirisch)',
  'master.intelligence.badge.rpm.UNKNOWN': 'RPM unbekannt',
  'master.intelligence.badge.rpm.explain.RPM_1HZ':
    'Empirisch als hochfrequentes RPM-Profil eingestuft. Kein Nachweis nativer 1-Hz-Abtastung am Gerät.',
  'master.intelligence.badge.rpm.explain.RPM_STANDARD':
    'Empirisch als Standard-RPM-Beobachtungsdichte eingestuft.',
  'master.intelligence.badge.rpm.explain.UNKNOWN': 'Unzureichende RPM-Cadence-Evidenz für ein stabiles Label.',
  'master.intelligence.badge.rpm.notApplicableNote':
    'ICE-RPM-Profil nicht anwendbar (z. B. BEV). Das ist nicht dasselbe wie unbekannte Signalqualität.',

  'master.intelligence.badge.limitation': 'Backend-Einschränkung: {{code}}',

  'master.intelligence.confidence.HIGH': 'Vertrauen: hoch',
  'master.intelligence.confidence.MEDIUM': 'Vertrauen: mittel',
  'master.intelligence.confidence.LOW': 'Vertrauen: niedrig',
  'master.intelligence.confidence.UNKNOWN': 'Vertrauen: unbekannt',

  'master.intelligence.density.SUB_ONE_HZ': 'Dichte: unter 1 Hz',
  'master.intelligence.density.ONE_SECOND_BUCKETS_UNPROVEN': 'Dichte: 1-Sek.-Buckets unbewiesen',
  'master.intelligence.density.IRREGULAR': 'Dichte: unregelmäßig',
  'master.intelligence.density.UNKNOWN': 'Dichte: unbekannt',
  'master.intelligence.density.NOT_APPLICABLE': 'Dichte: nicht anwendbar',

  'master.intelligence.evidence.title': 'Evidenz-Zeitstempel',
  'master.intelligence.evidence.evaluatedAt': 'Ausgewertet am',
  'master.intelligence.evidence.providerSourceTimestamp': 'Provider-Quellzeit',
  'master.intelligence.evidence.providerFetchedAt': 'Provider-Abrufzeit',
  'master.intelligence.evidence.profileRevision': 'Profil-Revision',
  'master.intelligence.evidence.fetchNotSignalProof':
    'Abrufzeit ist SynqDrive-Ingest — kein Beweis für ein neues Providersignal.',
  'master.intelligence.evidence.shadowNotExecutedPoll':
    'APDS-Shadow-Entscheidungen sind simulierte Abgleichsergebnisse, sofern keine echte Poll-ID verknüpft ist.',

  'master.intelligence.evidence.kind.observed': 'Art: beobachtete Provider-Evidenz',
  'master.intelligence.evidence.kind.simulated_shadow': 'Art: simulierte Shadow-Auswertung',
  'master.intelligence.evidence.kind.verified_real_execution': 'Art: verifizierte echte Poll-Ausführung',
  'master.intelligence.evidence.kind.not_available': 'Art: nicht verfügbar',
  'master.intelligence.evidence.kind.insufficient_evidence': 'Art: unzureichende Evidenz',
  'master.intelligence.evidence.kind.not_applicable': 'Art: nicht anwendbar',
  'master.intelligence.evidence.kind.evaluation_blocked': 'Art: Auswertung blockiert',

  'master.intelligence.blocked.title': 'Auswertung blockiert',
  'master.intelligence.blocked.body':
    'Profil-Klassifikation pausiert ({{code}}). Ein älteres Label darf nicht als aktuell angezeigt werden.',

  'master.intelligence.section.fleetOverview': 'Flottenkontext & Profile',
  'master.intelligence.section.signals': 'Signal-Detail',
  'master.intelligence.section.revisions': 'Profil-Revisionshistorie',
  'master.intelligence.section.capability': 'Capability-Resolver (nur Lesen)',

  'master.intelligence.vsi.picker.org': 'Organisation',
  'master.intelligence.vsi.picker.vehicle': 'Fahrzeug',
  'master.intelligence.vsi.picker.link': 'Provider-Quell-Link',
  'master.intelligence.vsi.loading': 'VSI-Lesemodelle werden geladen…',
  'master.intelligence.vsi.error': 'VSI-Intelligence konnte nicht geladen werden.',
  'master.intelligence.vsi.retry': 'Erneut versuchen',

  'master.intelligence.vsi.empty.selectScope.title': 'Organisation und Fahrzeug wählen',
  'master.intelligence.vsi.empty.selectScope.body':
    'Wählen Sie Organisation und Fahrzeug, um persistierte VSI-Signalprofile zu laden. Der Scope wird serverseitig geprüft — kein mandantenübergreifender Zugriff.',

  'master.intelligence.vsi.noProfiles.title': 'Keine VSI-Profile materialisiert',
  'master.intelligence.vsi.noProfiles.body':
    'Für dieses Fahrzeug existiert noch kein Signal-Capability-Profil. Das ist nicht dasselbe wie deaktivierte Revisionshistorie.',

  'master.intelligence.vsi.decision.lv': 'LV-Entscheidungscode: {{code}}',
  'master.intelligence.vsi.decision.rpm': 'RPM-Entscheidungscode: {{code}}',

  'master.intelligence.vsi.signals.intro':
    'Cadence-Labels beschreiben beobachtete Übertragungsmuster, keine bestätigte Hardware-Konfiguration.',
  'master.intelligence.vsi.signals.canonical': 'Kanonisches Signal',
  'master.intelligence.vsi.signals.provider': 'Provider-Name',
  'master.intelligence.vsi.signals.quality': 'Qualität / Vertrauen',
  'master.intelligence.vsi.signals.observedAt': 'Letzte Beobachtung (UTC + lokal)',
  'master.intelligence.vsi.signals.limitations': 'Einschränkungen',

  'master.intelligence.vsi.signals.rpmDual.intro':
    'Motordrehzahl (RPM) nutzt zwei getrennte Evidenz-Ebenen. Der Snapshot-Status stammt aus dem neuesten Vehicle-Latest-State-Bundle; HF/Kadenz aus gespiegelten Hochfrequenzpunkten und abgeschlossenen Fahrten. Sie sind nicht austauschbar.',
  'master.intelligence.vsi.signals.rpmDual.snapshotHeading': 'Snapshot (Vehicle Latest State)',
  'master.intelligence.vsi.signals.rpmDual.snapshotWindow':
    'Beobachtungsfenster: jüngstes zugeordnetes Provider-Bundle bei Profil-Materialisierung (keine HF-Historie).',
  'master.intelligence.vsi.signals.rpmDual.cadenceHeading': 'HF / Kadenz (Fahrtfenster)',
  'master.intelligence.vsi.signals.rpmDual.cadenceWindow':
    'Beobachtungsfenster: linkbezogene HF-Kadenz-Anreicherung (typisch bis zu 14 Tage abgeschlossener Fahrten).',
  'master.intelligence.vsi.signals.rpmDual.empirical': 'Empirische Beobachtung',
  'master.intelligence.vsi.signals.rpmDual.freshness': 'Aktualität',
  'master.intelligence.vsi.signals.rpmDual.lastValid': 'Letzte gültige Beobachtung',
  'master.intelligence.vsi.signals.rpmDual.quality': 'Qualität / Konfidenz',
  'master.intelligence.vsi.signals.rpmDual.provenance': 'Herkunft',
  'master.intelligence.vsi.signals.rpmDual.observedSamples': 'HF-Stichprobenanzahl',
  'master.intelligence.vsi.signals.rpmDual.activeProfile': 'Aktives RPM-Profil',
  'master.intelligence.vsi.signals.rpmDual.profileEvaluatedAt': 'Profil ausgewertet am',
  'master.intelligence.vsi.signals.rpmDual.finalizedTrips': 'Abgeschlossene Fahrten im Kadenzfenster',
  'master.intelligence.vsi.signals.rpmDual.decision': 'Klassifikationsentscheidung',
  'master.intelligence.vsi.signals.rpmDual.tripSupport': 'Unterstützende Fahrt-Klassifikationen',
  'master.intelligence.vsi.signals.rpmDual.notApplicable':
    'RPM-Kadenz-Klassifikation ist für diesen Antrieb nicht anwendbar (z. B. batterieelektrisch).',
  'master.intelligence.vsi.signals.rpmDual.noHfEvidence':
    'Keine HF-Kadenz-Evidenz im persistierten Profil (cadenceIntelligence fehlt oder leer).',
  'master.intelligence.vsi.signals.rpmDual.snapshotShort': 'Snapshot',
  'master.intelligence.vsi.signals.rpmDual.cadenceShort': 'HF/Kadenz',
  'master.intelligence.vsi.signals.rpmDual.hfEvidenceLine':
    'Profil {{profile}} · {{samples}} HF-Stichproben (siehe Panel)',
  'master.intelligence.vsi.signals.rpmDual.seePanel': 'Dual-Panel unten',

  'master.intelligence.vsi.revision.loading': 'Revisionshistorie wird geladen…',
  'master.intelligence.vsi.revision.loadError': 'Revisionshistorie konnte nicht geladen werden.',
  'master.intelligence.vsi.revision.retry': 'Revisionshistorie erneut laden',
  'master.intelligence.vsi.revision.notCaptured': 'Revisionshistorie: NOT_CAPTURED',
  'master.intelligence.vsi.revision.notCapturedExplain':
    'P5-H1-Revisionserfassung ist in dieser Umgebung deaktiviert. Fehlende Historie bedeutet nicht, dass sich das Profil nie geändert hat.',
  'master.intelligence.vsi.revision.moreAvailable':
    'Weitere Revisionen verfügbar — Cursor-Pagination über die API.',

  'master.intelligence.vsi.asOf.title': 'As-of-Revisionsauflösung',
  'master.intelligence.vsi.asOf.decisionAt': 'Entscheidungszeit',
  'master.intelligence.vsi.asOf.authority': 'Autorität',

  'master.intelligence.vehicleDetail.sectionTitle': 'Master Intelligence',
  'master.intelligence.vehicleDetail.readOnlyNote':
    'Schreibgeschützte Zusammenfassungen aus VSI-, APDS- und PDI-APIs. Labels beschreiben beobachtete oder persistierte Evidenz — kein Hardware-Nachweis.',
  'master.intelligence.vehicleDetail.loading': 'Intelligence-Zusammenfassungen werden geladen…',
  'master.intelligence.vehicleDetail.error': 'Intelligence-Zusammenfassungen für dieses Fahrzeug konnten nicht geladen werden.',
  'master.intelligence.vehicleDetail.openVsi': 'VSI-Detail öffnen',
  'master.intelligence.vehicleDetail.openApds': 'APDS-Detail öffnen',
  'master.intelligence.vehicleDetail.openPdi': 'Gerätedetail öffnen',
  'master.intelligence.vehicleDetail.noApdsDecision': 'Keine persistierte Entscheidung im Scope.',
  'master.intelligence.vehicleDetail.noPhysicalDevice':
    'Kein eindeutig installiertes physisches Gerät diesem Fahrzeug zugeordnet.',
  'master.intelligence.vehicleDetail.multipleLinks':
    'Mehrere Provider-Source-Links — primärer Link angezeigt; Link auf VSI/APDS prüfen, bevor fahrzeugübergreifende Annahmen getroffen werden.',
} as const;
