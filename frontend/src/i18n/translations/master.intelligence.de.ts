export const masterIntelligenceDe = {
  'master.nav.vsiIntelligence': 'VSI – Signal Intelligence',
  'master.nav.apdsIntelligence': 'APDS – Adaptives Polling',

  'master.intelligence.vsi.title': 'VSI – Signal Intelligence',
  'master.intelligence.vsi.description':
    'Schreibgeschützte Signalprofil-Auswertung, beobachtete Übertragungs-Cadence und Evidenz. Live-Daten folgen in PR2.',
  'master.intelligence.apds.title': 'APDS – Adaptives Polling',
  'master.intelligence.apds.description':
    'Shadow-Abgleichsentscheidungen und verknüpfte echte Poll-Evidenz. Entscheidungshistorie folgt in PR3.',

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
} as const;
