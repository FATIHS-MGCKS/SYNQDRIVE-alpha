export const rentalInvoiceDetailPrimaryDe = {
  'rental.invoice.detail.primary.amount.paid': 'Bezahlt',
  'rental.invoice.detail.primary.amount.outstanding': 'Offen',
  'rental.invoice.detail.primary.invoiceDate': 'Rechnungsdatum:',
  'rental.invoice.detail.primary.action.viewPdf': 'PDF ansehen',

  'rental.invoice.detail.primary.menu.more': 'Mehr',
  'rental.invoice.detail.primary.menu.issue': 'Ausstellen',
  'rental.invoice.detail.primary.menu.regeneratePdf': 'PDF neu erzeugen',
  'rental.invoice.detail.primary.menu.markSentExternally': 'Externen Versand erfassen',
  'rental.invoice.detail.primary.menu.recordPayment': 'Zahlung erfassen',

  'rental.invoice.detail.primary.relations.heading': 'Zuordnung',
  'rental.invoice.detail.primary.relations.template': 'Vorlage',

  'rental.invoice.detail.primary.fallback.archived': 'Relation archiviert',
  'rental.invoice.detail.primary.fallback.deleted': 'Relation gelöscht',
  'rental.invoice.detail.primary.fallback.unavailable': 'Daten nicht verfügbar',
  'rental.invoice.detail.primary.fallback.legacy': 'Legacy-Herkunft',

  'rental.invoice.detail.primary.permission.customer': 'Keine Berechtigung für Kundendetails',
  'rental.invoice.detail.primary.permission.booking': 'Keine Berechtigung für Buchungsdetails',
  'rental.invoice.detail.primary.permission.vehicle': 'Keine Berechtigung für Fahrzeugdetails',
  'rental.invoice.detail.primary.permission.default': 'Keine Berechtigung',

  'rental.invoice.detail.primary.period.unknown': 'Zeitraum unbekannt',
  'rental.invoice.detail.primary.period.until': 'bis {date}',
  'rental.invoice.detail.primary.period.from': 'ab {date}',

  'rental.invoice.detail.primary.gate.issueNotDraft': 'Nur Entwürfe können ausgestellt werden',
  'rental.invoice.detail.primary.gate.noPdfYet': 'Noch kein PDF vorhanden',
  'rental.invoice.detail.primary.gate.pdfAlreadyExists':
    'PDF ist bereits vorhanden — „PDF neu erzeugen“ im Menü',
  'rental.invoice.detail.primary.gate.pdfOutgoingOnly': 'PDF-Generierung nur für Ausgangsrechnungen',
  'rental.invoice.detail.primary.gate.issueBeforePdf': 'Zuerst ausstellen, danach PDF erzeugen',
  'rental.invoice.detail.primary.gate.pdfTerminalState':
    'Für stornierte oder abgeschlossene Sonderfälle nicht verfügbar',
  'rental.invoice.detail.primary.gate.pdfTypeUnavailable':
    'PDF-Generierung ist derzeit nur für Ausgangsrechnungen verfügbar',
  'rental.invoice.detail.primary.gate.emailAdminOnly':
    'Nur Administratoren können Rechnungen per E-Mail senden',
  'rental.invoice.detail.primary.gate.emailOutgoingOnly': 'E-Mail-Versand nur für Ausgangsrechnungen',
  'rental.invoice.detail.primary.gate.issueFirst': 'Zuerst ausstellen',
  'rental.invoice.detail.primary.gate.emailNeedsPdf': 'PDF muss zuerst erzeugt werden',
  'rental.invoice.detail.primary.gate.regenerateBookingOnly': 'Nur für Buchungsrechnungen mit PDF',
  'rental.invoice.detail.primary.gate.generatePdfFirst': 'Zuerst PDF erzeugen',
  'rental.invoice.detail.primary.gate.markSentState': 'Bereits gesendet oder noch nicht ausgestellt',
  'rental.invoice.detail.primary.gate.outgoingOnly': 'Nur für Ausgangsrechnungen',
  'rental.invoice.detail.primary.gate.paymentStatusBlocked': 'Für diesen Status nicht möglich',
  'rental.invoice.detail.primary.gate.noOutstandingAmount': 'Kein offener Betrag',
  'rental.invoice.detail.primary.gate.editDraftOrReview':
    'Bearbeiten nur für Entwürfe oder Rechnungen in Prüfung',
  'rental.invoice.detail.primary.gate.cancelNoPermission': 'Keine Berechtigung zum Stornieren',
  'rental.invoice.detail.primary.gate.cancelStatusBlocked':
    'Stornierung für diesen Status nicht möglich',
} as const;
