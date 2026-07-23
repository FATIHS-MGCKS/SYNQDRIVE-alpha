/**
 * Kunden-Rechtstexte — deutsche UI-Texte.
 */
import type { LegalDocumentsTranslationKey } from './legal-documents.en';

export const legalDocumentsDe: Record<LegalDocumentsTranslationKey, string> = {
  'legalDocuments.disclaimer':
    'SynqDrive führt administrativ freigegebene Rechtstextregeln aus, ersetzt jedoch keine juristische Prüfung oder Rechtsberatung.',

  'legalDocuments.page.eyebrow': 'Verwaltung',
  'legalDocuments.page.title': 'Kunden-Rechtstexte',
  'legalDocuments.page.description':
    'Freigegebene Vertrags- und Datenschutzhinweise für Buchungen und Kundenprozesse verwalten.',
  'legalDocuments.page.newVersion': 'Neue Version',
  'legalDocuments.page.refresh': 'Aktualisieren',
  'legalDocuments.page.loadError': 'Rechtstexte konnten nicht geladen werden',
  'legalDocuments.page.orgUnavailable': 'Organisation nicht verfügbar',
  'legalDocuments.page.orgUnavailableDetail':
    'Die Rechtstexte können ohne Mandantenkontext nicht geladen werden.',
  'legalDocuments.page.auditHint': 'Audit-Hinweis: {message}',

  'legalDocuments.status.DRAFT': 'Entwurf',
  'legalDocuments.status.IN_REVIEW': 'In Prüfung',
  'legalDocuments.status.APPROVED': 'Freigegeben',
  'legalDocuments.status.SCHEDULED': 'Geplante Aktivierung',
  'legalDocuments.status.ACTIVE': 'Aktiv',
  'legalDocuments.status.SUPERSEDED': 'Ersetzt',
  'legalDocuments.status.REVOKED': 'Widerrufen',
  'legalDocuments.status.ARCHIVED': 'Archiviert',

  'legalDocuments.readiness.overall.ready': 'Einsatzbereit',
  'legalDocuments.readiness.overall.readyDetail':
    'Alle Pflicht-Kategorien sind für Buchungen freigegeben.',
  'legalDocuments.readiness.overall.critical': 'Nicht einsatzbereit',
  'legalDocuments.readiness.overall.criticalDetail':
    '{count} Kategorien blockieren vollständige Buchungsdokumente.',
  'legalDocuments.readiness.overall.attention': 'Teilweise eingeschränkt',
  'legalDocuments.readiness.overall.attentionDetail':
    '{count} Kategorien mit offenen Hinweisen — Buchungen können eingeschränkt sein.',

  'legalDocuments.readiness.category.notProvided': 'Nicht hinterlegt',
  'legalDocuments.readiness.category.notReady': 'Nicht einsatzbereit',
  'legalDocuments.readiness.category.blocked': 'Blockiert',
  'legalDocuments.readiness.category.limited': 'Einschränkung',
  'legalDocuments.readiness.category.ready': 'Einsatzbereit',

  'legalDocuments.readiness.issue.noVersion': 'Keine Version vorhanden',
  'legalDocuments.readiness.issue.noActive': 'Keine aktive Version für Buchungen',
  'legalDocuments.readiness.issue.scanBlocking': 'Malware-Scan: {status}',
  'legalDocuments.readiness.issue.scanPending': 'Scan ausstehend: {status}',
  'legalDocuments.readiness.issue.integrityBlocking': 'Integrität: {status}',
  'legalDocuments.readiness.issue.integrityUnverified': 'Integrität noch nicht verifiziert',
  'legalDocuments.readiness.issue.languageMismatch':
    'Aktive Sprache: {actual} (erwartet: {expected})',
  'legalDocuments.readiness.issue.jurisdictionMismatch':
    'Jurisdiktion: {actual} (erwartet: {expected})',

  'legalDocuments.readiness.next.uploadAndApprove': 'PDF hochladen und freigeben',
  'legalDocuments.readiness.next.reviewAndActivate': 'Entwurf prüfen und aktivieren',
  'legalDocuments.readiness.next.activateApproved': 'Freigegebene Version aktivieren',
  'legalDocuments.readiness.next.uploadAndActivate': 'Version hochladen und aktivieren',
  'legalDocuments.readiness.next.fixScanIntegrity': 'Scan- oder Integritätsfehler beheben',
  'legalDocuments.readiness.next.review': 'Prüfen',

  'legalDocuments.readiness.missingLanguage':
    'Keine aktive Version für Sprache {language}',

  'legalDocuments.readiness.strip.overall': 'Gesamtstatus',
  'legalDocuments.readiness.strip.ready': 'Einsatzbereit',
  'legalDocuments.readiness.strip.limited': 'Einschränkung',
  'legalDocuments.readiness.strip.limitedHintOpen': 'Prüfhinweise offen',
  'legalDocuments.readiness.strip.limitedHintNone': 'Keine offenen Hinweise',
  'legalDocuments.readiness.strip.blocked': 'Blockiert / fehlend',
  'legalDocuments.readiness.strip.blockedHint': 'Buchungsdokumente unvollständig',
  'legalDocuments.readiness.strip.blockedHintNone': 'Keine blockierten Kategorien',

  'legalDocuments.categories.title': 'Dokumentkategorien',
  'legalDocuments.categories.description':
    'Pflicht-Rechtstexte für Buchungs- und Kundenprozesse',
  'legalDocuments.categories.loading': 'Dokumentkategorien werden geladen',
  'legalDocuments.categories.activeVersion': 'Aktive Version',
  'legalDocuments.categories.validSince': 'Gültig seit',
  'legalDocuments.categories.approvedBy': 'Freigegeben von',
  'legalDocuments.categories.languageJurisdiction': 'Sprache / Jurisdiktion',
  'legalDocuments.categories.variant': 'Variante',
  'legalDocuments.categories.noActive':
    'Keine aktive Version — Buchungsanhänge für diese Kategorie fehlen.',
  'legalDocuments.categories.nextStep': 'Nächster Schritt: {action}',
  'legalDocuments.categories.inReview': '{count} in Prüfung',
  'legalDocuments.categories.drafts': '{count} Entwurf',
  'legalDocuments.categories.showHistory': '{title} — Versionshistorie anzeigen',

  'legalDocuments.alerts.title': 'Kritische Konfigurationshinweise',
  'legalDocuments.alerts.description':
    'Priorisierte Maßnahmen vor Freigabe oder Buchungsbetrieb',
  'legalDocuments.alerts.severity.critical': 'Kritisch',
  'legalDocuments.alerts.severity.warning': 'Hinweis',
  'legalDocuments.alerts.severity.info': 'Info',
  'legalDocuments.alerts.actionRequired': 'Aktion erforderlich',
  'legalDocuments.alerts.reviewRecommended': 'Prüfung empfohlen',
  'legalDocuments.alerts.checkCategory': 'Details in der Kategorie prüfen',

  'legalDocuments.type.TERMS_AND_CONDITIONS.title': 'Allgemeine Geschäftsbedingungen (AGB)',
  'legalDocuments.type.TERMS_AND_CONDITIONS.hint':
    'Nach Aktivierung in Buchungsunterlagen und im Mietvertrag referenziert.',

  'legalDocuments.type.CONSUMER_INFORMATION.title': 'Verbraucherinformation',
  'legalDocuments.type.CONSUMER_INFORMATION.hint':
    'Administrativ freigegebene Verbraucherinformation — Variante nach org-interner Auswahl (keine Rechtsberatung durch SynqDrive).',

  'legalDocuments.type.PRIVACY_POLICY.title': 'Datenschutzerklärung',
  'legalDocuments.type.PRIVACY_POLICY.hint':
    'Nach Aktivierung für Kunden im Buchungsprozess bereitgestellt und ggf. per E-Mail versendet.',

  'legalDocuments.variant.WITHDRAWAL_RIGHT_NOTICE': 'Widerrufsbelehrung (falls anwendbar)',
  'legalDocuments.variant.NO_WITHDRAWAL_RIGHT_NOTICE':
    'Hinweis auf fehlendes Widerrufsrecht (falls anwendbar)',
  'legalDocuments.variant.OTHER_CONSUMER_INFORMATION': 'Sonstige Verbraucherinformation',

  'legalDocuments.wizard.title': 'Neue Rechtstext-Version',
  'legalDocuments.wizard.description':
    'Mehrstufiger Upload — Aktivierung erfolgt separat nach Freigabe.',
  'legalDocuments.wizard.step.classification': 'Einordnung',
  'legalDocuments.wizard.step.version': 'Version & Gültigkeit',
  'legalDocuments.wizard.step.file': 'Datei',
  'legalDocuments.wizard.step.review': 'Prüfung',
  'legalDocuments.wizard.stepProgress': 'Schritt {current} von {total}',
  'legalDocuments.wizard.stepProgressAria': 'Upload-Fortschritt: Schritt {current} von {total}',
  'legalDocuments.wizard.cancel': 'Abbrechen',
  'legalDocuments.wizard.back': 'Zurück',
  'legalDocuments.wizard.next': 'Weiter',
  'legalDocuments.wizard.saveDraft': 'Als Entwurf speichern',
  'legalDocuments.wizard.requestReview': 'Review anfordern',
  'legalDocuments.wizard.abortTitle': 'Upload abbrechen?',
  'legalDocuments.wizard.abortUploading':
    'Der laufende Upload wird abgebrochen. Bereits hochgeladene Entwürfe bleiben als Entwurf gespeichert.',
  'legalDocuments.wizard.abortDirty': 'Nicht gespeicherte Eingaben gehen verloren.',
  'legalDocuments.wizard.abortConfirm': 'Abbrechen',
  'legalDocuments.wizard.abortContinue': 'Weiter bearbeiten',
  'legalDocuments.wizard.draftSaved': 'Entwurf gespeichert.',
  'legalDocuments.wizard.reviewRequested': 'Review angefordert.',
  'legalDocuments.wizard.uploadProgress': 'Upload läuft…',
  'legalDocuments.wizard.uploadPercent': '{percent}%',
  'legalDocuments.wizard.uploadLive': 'Upload läuft: {percent} Prozent',
  'legalDocuments.wizard.uploadComplete': 'Upload abgeschlossen',
  'legalDocuments.wizard.errorSummary': 'Bitte korrigieren Sie die markierten Felder:',
  'legalDocuments.wizard.reviewNote':
    'Neue Buchungen erhalten nach Freigabe und Aktivierung die hier hinterlegte Version — nicht beim Speichern als Entwurf.',

  'legalDocuments.wizard.field.documentType': 'Dokumenttyp',
  'legalDocuments.wizard.field.variant': 'Dokumentvariante',
  'legalDocuments.wizard.field.language': 'Sprache',
  'legalDocuments.wizard.field.jurisdiction': 'Jurisdiktion',
  'legalDocuments.wizard.field.customerSegment': 'B2B / B2C',
  'legalDocuments.wizard.field.bookingChannel': 'Buchungskanal',
  'legalDocuments.wizard.field.stationScope': 'Geltungsbereich',
  'legalDocuments.wizard.field.productScope': 'Produktbereich',
  'legalDocuments.wizard.field.stations': 'Stationen',
  'legalDocuments.wizard.field.mandatory': 'Pflichtdokument für Buchungen',
  'legalDocuments.wizard.field.versionLabel': 'Versionsbezeichnung',
  'legalDocuments.wizard.field.displayTitle': 'Anzeigetitel',
  'legalDocuments.wizard.field.validFrom': 'Gültig ab',
  'legalDocuments.wizard.field.validUntil': 'Gültig bis (optional)',
  'legalDocuments.wizard.field.changeSummary': 'Änderungshinweis',
  'legalDocuments.wizard.field.legalOwner': 'Verantwortliche Fachperson',
  'legalDocuments.wizard.field.fileName': 'Dateiname',
  'legalDocuments.wizard.field.fileSize': 'Größe',
  'legalDocuments.wizard.field.clientValidation': 'Client-Validierung',
  'legalDocuments.wizard.field.version': 'Version',
  'legalDocuments.wizard.field.file': 'Datei',
  'legalDocuments.wizard.field.status': 'Status',
  'legalDocuments.wizard.field.pageCount': 'Seiten',
  'legalDocuments.wizard.field.scan': 'Malware-Scan',
  'legalDocuments.wizard.field.integrity': 'Integrität',
  'legalDocuments.wizard.field.checksum': 'Prüfsumme',

  'legalDocuments.wizard.placeholder.select': 'Bitte wählen…',
  'legalDocuments.wizard.placeholder.version': 'z. B. 2026-01',
  'legalDocuments.wizard.placeholder.optional': 'Optional',
  'legalDocuments.wizard.placeholder.changeSummary': 'Kurzbeschreibung der inhaltlichen Änderungen',
  'legalDocuments.wizard.placeholder.legalOwner': 'Name der fachlich Verantwortlichen',

  'legalDocuments.wizard.file.dropTitle': 'PDF hier ablegen',
  'legalDocuments.wizard.file.dropHint': 'oder Datei auswählen',
  'legalDocuments.wizard.file.choose': 'Datei wählen',
  'legalDocuments.wizard.file.clientOk': 'PDF-Format geprüft (Server validiert beim Upload)',

  'legalDocuments.wizard.review.permissionHint':
    'Review anfordern erfordert die Berechtigung „Prüfung einreichen“.',

  'legalDocuments.validation.documentTypeRequired': 'Dokumenttyp ist erforderlich.',
  'legalDocuments.validation.variantRequired': 'Dokumentvariante ist erforderlich.',
  'legalDocuments.validation.languageRequired': 'Sprache ist erforderlich.',
  'legalDocuments.validation.jurisdictionRequired': 'Jurisdiktion ist erforderlich.',
  'legalDocuments.validation.customerSegmentRequired': 'Kundensegment ist erforderlich.',
  'legalDocuments.validation.bookingChannelRequired': 'Buchungskanal ist erforderlich.',
  'legalDocuments.validation.stationScopeRequired': 'Geltungsbereich ist erforderlich.',
  'legalDocuments.validation.stationIdsRequired': 'Mindestens eine Station auswählen.',
  'legalDocuments.validation.versionLabelRequired': 'Versionsbezeichnung ist erforderlich.',
  'legalDocuments.validation.versionLabelFormat':
    'Nur Buchstaben, Zahlen, Punkt, Bindestrich und Leerzeichen (max. 64 Zeichen).',
  'legalDocuments.validation.versionLabelDuplicate':
    'Diese Versionsbezeichnung existiert bereits für den gewählten Dokumenttyp.',
  'legalDocuments.validation.validUntilAfterFrom': '„Gültig bis“ muss nach „Gültig ab“ liegen.',
  'legalDocuments.validation.fileRequired': 'PDF-Datei ist erforderlich.',
  'legalDocuments.validation.filePdfOnly':
    'Nur PDF-Dateien sind erlaubt (inkl. iOS-Dateiauswahl ohne MIME-Typ).',
  'legalDocuments.validation.fileTooLarge': 'Datei überschreitet {maxMb} MB.',
  'legalDocuments.validation.reasonRequired': 'Begründung ist erforderlich.',
  'legalDocuments.validation.reasonMinLength': 'Mindestens {min} Zeichen erforderlich.',
  'legalDocuments.validation.validFromRequired': 'Gültigkeitsbeginn ist erforderlich.',
  'legalDocuments.validation.validFromInvalid': 'Ungültiges Datum.',
  'legalDocuments.validation.validFromFuture': 'Der Gültigkeitsbeginn muss in der Zukunft liegen.',

  'legalDocuments.option.language.de': 'Deutsch (de)',
  'legalDocuments.option.language.en': 'Englisch (en)',
  'legalDocuments.option.language.fr': 'Französisch (fr)',
  'legalDocuments.option.jurisdiction.DE': 'Deutschland (DE)',
  'legalDocuments.option.jurisdiction.AT': 'Österreich (AT)',
  'legalDocuments.option.jurisdiction.CH': 'Schweiz (CH)',
  'legalDocuments.option.segment.BOTH': 'B2B & B2C',
  'legalDocuments.option.segment.B2C': 'B2C — Privatkunden',
  'legalDocuments.option.segment.B2B': 'B2B — Geschäftskunden',
  'legalDocuments.option.channel.ALL': 'Alle Kanäle',
  'legalDocuments.option.channel.WEBSITE': 'Website',
  'legalDocuments.option.channel.OPERATOR_APP': 'Operator-App',
  'legalDocuments.option.channel.MANUAL': 'Manuelle Buchung',
  'legalDocuments.option.channel.API': 'API',
  'legalDocuments.option.stationScope.ORGANIZATION_WIDE': 'Organisationsweit',
  'legalDocuments.option.stationScope.STATION_SPECIFIC': 'Stationsspezifisch',
  'legalDocuments.option.productScope.all': 'Alle Geschäftsbereiche',
  'legalDocuments.option.productScope.RENTAL': 'Vermietung',
  'legalDocuments.option.productScope.FLEET': 'Flotte',
  'legalDocuments.option.productScope.TAXI': 'Taxi',
  'legalDocuments.option.productScope.LOGISTICS': 'Logistik',
  'legalDocuments.option.productScope.OTHER': 'Sonstige',

  'legalDocuments.lifecycle.action.submit_review.title': 'Review anfordern',
  'legalDocuments.lifecycle.action.submit_review.description':
    'Die Version wird zur fachlichen Prüfung eingereicht. Sie wird erst nach Freigabe und Aktivierung für neue Buchungen verbindlich.',
  'legalDocuments.lifecycle.action.submit_review.confirm': 'Review anfordern',

  'legalDocuments.lifecycle.action.request_changes.title': 'Änderungen anfordern',
  'legalDocuments.lifecycle.action.request_changes.description':
    'Die Version geht zurück in den Entwurfsstatus. Der Uploader kann Inhalte anpassen und erneut einreichen.',
  'legalDocuments.lifecycle.action.request_changes.confirm': 'Zurück an Entwurf',

  'legalDocuments.lifecycle.action.approve.title': 'Version freigeben',
  'legalDocuments.lifecycle.action.approve.description':
    'Nach der Freigabe kann die Version sofort oder zu einem geplanten Zeitpunkt aktiviert werden.',
  'legalDocuments.lifecycle.action.approve.confirm': 'Freigeben',

  'legalDocuments.lifecycle.action.schedule_activation.title': 'Aktivierung planen',
  'legalDocuments.lifecycle.action.schedule_activation.description':
    'Die Version wird für den gewählten Gültigkeitsbeginn geplant. Bis dahin bleibt die bisher aktive Version für neue Buchungen maßgeblich.',
  'legalDocuments.lifecycle.action.schedule_activation.confirm': 'Aktivierung planen',

  'legalDocuments.lifecycle.action.activate_now.title': 'Sofort aktivieren',
  'legalDocuments.lifecycle.action.activate_now.description':
    'Die Version wird unmittelbar für neue Buchungen verbindlich. Bestehende Buchungen bleiben unverändert.',
  'legalDocuments.lifecycle.action.activate_now.confirm': 'Jetzt aktivieren',

  'legalDocuments.lifecycle.action.replace_active.title': 'Aktive Version ersetzen',
  'legalDocuments.lifecycle.action.replace_active.description':
    'Die neue Version wird sofort aktiv. Die bisher aktive Version wird als „Ersetzt“ markiert — kein Widerruf.',
  'legalDocuments.lifecycle.action.replace_active.confirm': 'Aktive Version ersetzen',

  'legalDocuments.lifecycle.action.revoke.title': 'Version widerrufen',
  'legalDocuments.lifecycle.action.revoke.description':
    'Widerruf zieht die Version für neue Buchungen zurück. Dies ist keine normale Ersetzung — verwenden Sie Aktivierung nur bei inhaltlichen Updates.',
  'legalDocuments.lifecycle.action.revoke.confirm': 'Widerrufen',

  'legalDocuments.lifecycle.action.archive.title': 'Version archivieren',
  'legalDocuments.lifecycle.action.archive.description':
    'Die Version wird archiviert und aus dem operativen Workflow entfernt. Historische Snapshots und Nachweise bleiben erhalten — es erfolgt keine Löschung.',
  'legalDocuments.lifecycle.action.archive.confirm': 'Archivieren',

  'legalDocuments.lifecycle.actionLabel.submit_review': 'Review anfordern',
  'legalDocuments.lifecycle.actionLabel.request_changes': 'Änderungen anfordern',
  'legalDocuments.lifecycle.actionLabel.approve': 'Freigeben',
  'legalDocuments.lifecycle.actionLabel.schedule_activation': 'Aktivierung planen',
  'legalDocuments.lifecycle.actionLabel.activate_now': 'Sofort aktivieren',
  'legalDocuments.lifecycle.actionLabel.replace_active': 'Aktive Version ersetzen',
  'legalDocuments.lifecycle.actionLabel.revoke': 'Widerrufen',
  'legalDocuments.lifecycle.actionLabel.archive': 'Archivieren',

  'legalDocuments.lifecycle.disabled.scanFailed': 'Malware-Scan nicht bestanden',
  'legalDocuments.lifecycle.disabled.fourEyesReview':
    'Vier-Augen: Sie haben diese Version eingereicht oder hochgeladen',
  'legalDocuments.lifecycle.disabled.fourEyesUpload':
    'Vier-Augen: Sie haben diese Version hochgeladen',

  'legalDocuments.lifecycle.dialog.statusLine': 'Status: {status} · v{version}',
  'legalDocuments.lifecycle.dialog.close': 'Schließen',
  'legalDocuments.lifecycle.dialog.cancel': 'Abbrechen',
  'legalDocuments.lifecycle.dialog.validFromLabel': 'Gültig ab (geplante Aktivierung) *',
  'legalDocuments.lifecycle.dialog.reasonLabel': 'Begründung *',
  'legalDocuments.lifecycle.dialog.reasonPlaceholder':
    'Pflichtbegründung für Audit und Nachvollziehbarkeit',
  'legalDocuments.lifecycle.dialog.changeSummaryLabel': 'Änderungshinweis (optional)',
  'legalDocuments.lifecycle.dialog.confirmed': 'Aktion bestätigt',
  'legalDocuments.lifecycle.dialog.auditLine': 'Audit: {event} · {time}',
  'legalDocuments.lifecycle.dialog.orgUnavailable': 'Organisation nicht verfügbar',
  'legalDocuments.lifecycle.dialog.unknownAction': 'Unbekannte Aktion',

  'legalDocuments.lifecycle.impact.documentType': 'Dokumenttyp',
  'legalDocuments.lifecycle.impact.newVersion': 'Neue Version',
  'legalDocuments.lifecycle.impact.previousActive': 'Bisher aktive Version',
  'legalDocuments.lifecycle.impact.noActive': 'Keine aktive Version',
  'legalDocuments.lifecycle.impact.validFrom': 'Gültigkeitsbeginn',
  'legalDocuments.lifecycle.impact.validFromOnSchedule': '(wird beim Planen festgelegt)',
  'legalDocuments.lifecycle.impact.validFromOnActivate': 'Bei Aktivierung sofort',
  'legalDocuments.lifecycle.impact.language': 'Sprache',
  'legalDocuments.lifecycle.impact.jurisdiction': 'Jurisdiktion',
  'legalDocuments.lifecycle.impact.channel': 'Kanal',
  'legalDocuments.lifecycle.impact.customerSegment': 'Kundensegment',
  'legalDocuments.lifecycle.impact.existingBookings': 'Bestehende Buchungen',
  'legalDocuments.lifecycle.impact.existingBookingsValue': 'Bleiben unverändert (gebundene Snapshots)',
  'legalDocuments.lifecycle.impact.newBookings': 'Neue Buchungen',
  'legalDocuments.lifecycle.impact.newBookings.revoke':
    'Erhalten diese Version nicht mehr — Widerruf wirkt vorwärts',
  'legalDocuments.lifecycle.impact.newBookings.archive':
    'Unverändert — Archivierung betrifft nur den Workflow',
  'legalDocuments.lifecycle.impact.newBookings.pending':
    'Noch keine Änderung — erst nach Aktivierung',
  'legalDocuments.lifecycle.impact.newBookings.afterActivation':
    'Verwenden die neue Version nach Aktivierung',

  'legalDocuments.lifecycle.notice.revoke':
    'Widerruf ist rechtlich anders als eine Ersetzung: bestehende Verträge bleiben gebunden, neue Buchungen erhalten diese Version nicht mehr.',
  'legalDocuments.lifecycle.notice.replace':
    'Die bisher aktive Version wird als „Ersetzt“ markiert — kein Widerruf, keine Löschung.',
  'legalDocuments.lifecycle.notice.archive':
    'Archivierte Versionen bleiben in Snapshots und Nachweisen sichtbar. Es werden keine Dateien gelöscht.',
  'legalDocuments.lifecycle.notice.fourEyes':
    'Vier-Augen-Prinzip ist aktiv: Freigabe und Aktivierung dürfen nicht durch dieselbe Person erfolgen, die hochgeladen oder zur Prüfung eingereicht hat.',
  'legalDocuments.lifecycle.notice.fourEyesBlocked': ' Sie sind für diese Aktion gesperrt.',

  'legalDocuments.lifecycle.event.SUBMITTED_FOR_REVIEW': 'Review angefordert',
  'legalDocuments.lifecycle.event.APPROVED': 'Freigegeben',
  'legalDocuments.lifecycle.event.SCHEDULED': 'Aktivierung geplant',
  'legalDocuments.lifecycle.event.ACTIVATED': 'Aktiviert',
  'legalDocuments.lifecycle.event.SUPERSEDED': 'Ersetzt',
  'legalDocuments.lifecycle.event.REVOKED': 'Widerrufen',
  'legalDocuments.lifecycle.event.ARCHIVED': 'Archiviert',
  'legalDocuments.lifecycle.event.RETURNED_TO_DRAFT': 'Änderungen angefordert',
  'legalDocuments.lifecycle.event.UPLOADED': 'Hochgeladen',
  'legalDocuments.lifecycle.event.SUBMITTED_FOR_REVIEW_DETAIL': 'Zur Prüfung eingereicht',
  'legalDocuments.lifecycle.event.LEGAL_HOLD_SET': 'Legal Hold gesetzt',
  'legalDocuments.lifecycle.event.LEGAL_HOLD_CLEARED': 'Legal Hold aufgehoben',
  'legalDocuments.lifecycle.event.STORAGE_PURGED': 'Datei gelöscht (Retention)',
  'legalDocuments.lifecycle.event.STORAGE_PURGE_FAILED': 'Löschung fehlgeschlagen',
  'legalDocuments.lifecycle.event.RECIPIENT_REDACTED': 'Empfängerdaten redigiert',

  'legalDocuments.lifecycle.conflict.ACTIVE_CONFLICT':
    'Eine andere Version wurde parallel aktiviert. Die Daten wurden aktualisiert — bitte prüfen Sie den aktuellen Status erneut.',
  'legalDocuments.lifecycle.conflict.SCOPE_CONFLICT':
    'Der Geltungsbereich überschneidet sich mit einer bereits aktiven Version. Passen Sie Scope oder Version an.',
  'legalDocuments.lifecycle.conflict.FOUR_EYES_VIOLATION':
    'Vier-Augen-Prinzip: Freigabe oder Aktivierung durch denselben Benutzer wie Upload oder Review-Einreichung ist nicht erlaubt.',
  'legalDocuments.lifecycle.conflict.INVALID_STATUS_TRANSITION':
    'Der Status hat sich zwischenzeitlich geändert. Bitte laden Sie die Liste neu.',
  'legalDocuments.lifecycle.conflict.NOT_ACTIVATABLE':
    'Diese Version kann im aktuellen Status nicht aktiviert werden.',
  'legalDocuments.lifecycle.conflict.SCAN_NOT_PASSED':
    'Malware-Scan nicht bestanden — Aktivierung oder Review ist blockiert.',

  'legalDocuments.history.title': 'Versionshistorie',
  'legalDocuments.history.description':
    'Serverseitig paginierte Historie je Rechtstexttyp mit Filtern und Detailansicht',
  'legalDocuments.history.collapse': 'Einklappen',
  'legalDocuments.history.expand': 'Ausklappen',
  'legalDocuments.history.filter.language': 'Sprache',
  'legalDocuments.history.filter.status': 'Status',
  'legalDocuments.history.filter.jurisdiction': 'Jurisdiktion',
  'legalDocuments.history.filter.from': 'Erstellt ab',
  'legalDocuments.history.filter.to': 'Erstellt bis',
  'legalDocuments.history.filter.all': 'Alle',
  'legalDocuments.history.filter.allLanguages': 'Alle Sprachen',
  'legalDocuments.history.filter.allStatuses': 'Alle Status',
  'legalDocuments.history.filter.allJurisdictions': 'Alle Jurisdiktionen',
  'legalDocuments.history.filter.reset': 'Filter zurücksetzen',
  'legalDocuments.history.column.version': 'Version',
  'legalDocuments.history.column.language': 'Sprache',
  'legalDocuments.history.column.jurisdiction': 'Jurisdiktion',
  'legalDocuments.history.column.status': 'Status',
  'legalDocuments.history.column.validity': 'Gültigkeit',
  'legalDocuments.history.column.approved': 'Freigabe',
  'legalDocuments.history.column.activated': 'Aktivierung',
  'legalDocuments.history.column.checksum': 'Prüfsumme',
  'legalDocuments.history.column.scanIntegrity': 'Scan / Integrität',
  'legalDocuments.history.column.usage': 'Verwendungen',
  'legalDocuments.history.validUntil': 'bis {date}',
  'legalDocuments.history.empty': 'Noch keine Versionen für diesen Rechtstexttyp',
  'legalDocuments.history.emptyFiltered': 'Keine Versionen für die gewählten Filter',
  'legalDocuments.history.loadError': 'Versionen konnten nicht geladen werden',
  'legalDocuments.history.actions': 'Aktionen',
  'legalDocuments.history.pagination':
    '{total} Versionen · Seite {page} von {totalPages}',
  'legalDocuments.history.paginationSingle':
    '{total} Version · Seite {page} von {totalPages}',
  'legalDocuments.history.prevPage': 'Vorherige Seite',
  'legalDocuments.history.nextPage': 'Nächste Seite',

  'legalDocuments.detail.eyebrow': 'Rechtstext',
  'legalDocuments.detail.title': 'Version {version}',
  'legalDocuments.detail.download': 'PDF herunterladen',
  'legalDocuments.detail.loading': 'Details werden geladen…',
  'legalDocuments.detail.noneSelected': 'Keine Version ausgewählt.',
  'legalDocuments.detail.metadata': 'Metadaten',
  'legalDocuments.detail.lifecycle': 'Lifecycle',
  'legalDocuments.detail.noLifecycle': 'Noch keine Lifecycle-Ereignisse.',
  'legalDocuments.detail.auditEvents': 'Audit-Ereignisse',
  'legalDocuments.detail.usage': 'Verwendung',
  'legalDocuments.detail.usage.snapshots': 'Snapshots',
  'legalDocuments.detail.usage.bookings': 'Buchungen',
  'legalDocuments.detail.usage.contracts': 'Verträge',
  'legalDocuments.detail.usage.deliveryEvidence': 'Zustellnachweise',
  'legalDocuments.detail.usage.deliveryStatus': 'Zustellstatus: {summary}',
  'legalDocuments.detail.usage.noDelivery': 'Keine Zustellnachweise',
  'legalDocuments.detail.usage.noReferences':
    'Noch keine Verwendungen in Buchungen oder Verträgen.',
  'legalDocuments.detail.usage.unavailable': 'Verwendungsdaten nicht verfügbar.',
  'legalDocuments.detail.usage.contractRef': 'Vertrag {number}',
  'legalDocuments.detail.usage.generatedDoc': 'Generiertes Dokument',
  'legalDocuments.detail.preview': 'PDF-Vorschau',
  'legalDocuments.detail.previewLoading': 'Vorschau wird geladen…',
  'legalDocuments.detail.previewUnavailable':
    'Vorschau nicht verfügbar. Download erfordert Berechtigung.',
  'legalDocuments.detail.pages': 'Seiten',
  'legalDocuments.detail.changes': 'Änderungen',
  'legalDocuments.detail.responsible': 'Verantwortlich',
  'legalDocuments.detail.loadError': 'Details konnten nicht geladen werden',

  'legalDocuments.audit.title': 'Audit & Verwendung',
  'legalDocuments.audit.description': 'Letzte Lifecycle-Ereignisse und Freigaben (read-only)',
  'legalDocuments.audit.empty': 'Noch keine Audit-Einträge vorhanden.',
  'legalDocuments.audit.loadError': 'Audit-Ereignisse konnten nicht geladen werden',
  'legalDocuments.audit.system': 'System',

  'legalDocuments.scan.UPLOADED': 'Hochgeladen',
  'legalDocuments.scan.PENDING': 'Ausstehend',
  'legalDocuments.scan.SCANNING': 'Wird gescannt',
  'legalDocuments.scan.SCAN_PASSED': 'OK',
  'legalDocuments.scan.FAILED': 'Fehlgeschlagen',
  'legalDocuments.scan.INFECTED': 'Infiziert',
  'legalDocuments.scan.REJECTED': 'Abgelehnt',
  'legalDocuments.scan.QUARANTINED': 'Quarantäne',
  'legalDocuments.scan.SCAN_FAILED': 'Scan fehlgeschlagen',

  'legalDocuments.integrity.UNVERIFIED': 'Ungeprüft',
  'legalDocuments.integrity.VERIFIED': 'Verifiziert',
  'legalDocuments.integrity.CHECKSUM_MISMATCH': 'Prüfsumme abweichend',
  'legalDocuments.integrity.MISSING_OBJECT': 'Datei fehlt',
  'legalDocuments.integrity.STORAGE_ERROR': 'Speicherfehler',
  'legalDocuments.integrity.INTEGRITY_FAILED': 'Integrität fehlgeschlagen',

  'legalDocuments.tooltip.checksum':
    'Kryptografischer Fingerabdruck der gespeicherten PDF. Dient der Erkennung von Dateiänderungen.',
  'legalDocuments.tooltip.integrity':
    'Prüft, ob die gespeicherte Datei noch zur Prüfsumme passt und lesbar ist.',
  'legalDocuments.tooltip.snapshot':
    'Unveränderliche Kopie des Rechtstexts, gebunden an eine Buchung oder einen Vertrag zum Erstellungszeitpunkt.',
  'legalDocuments.tooltip.scan':
    'Malware-Scan-Status der hochgeladenen PDF vor Freigabe oder Aktivierung.',

  'legalDocuments.toast.checksumCopied': 'Prüfsumme kopiert',
  'legalDocuments.toast.copyFailed': 'Kopieren fehlgeschlagen',
  'legalDocuments.toast.actionFallback': 'Aktion',
  'legalDocuments.toast.actionSuccess': '{action} — {event}',
  'legalDocuments.toast.actionStatus': '{action} — Status: {status}',

  'legalDocuments.scanError.failed':
    'Malware-Scan fehlgeschlagen — Entwurf wurde nicht freigegeben.',
  'legalDocuments.scanError.status': 'Malware-Scan-Status: {status}',

  'legalDocuments.error.unknown': 'Unbekannter Fehler',
  'legalDocuments.error.api': 'API-Fehler {status}',

  'legalDocuments.a11y.pdfPreview': 'PDF-Vorschau des Rechtstexts',
  'legalDocuments.a11y.showDetail': 'Details zu Version {version} anzeigen',
  'legalDocuments.a11y.downloadVersion': 'Version {version} herunterladen',
  'legalDocuments.a11y.lifecycleActions': 'Lifecycle-Aktionen für Version {version}',
  'legalDocuments.a11y.copyChecksum': 'Prüfsumme kopieren',

  'legalDocuments.common.emDash': '—',
  'legalDocuments.common.until': '–',
};
