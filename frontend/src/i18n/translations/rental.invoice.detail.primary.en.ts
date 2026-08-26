export const rentalInvoiceDetailPrimaryEn = {
  'rental.invoice.detail.primary.amount.paid': 'Paid',
  'rental.invoice.detail.primary.amount.outstanding': 'Outstanding',
  'rental.invoice.detail.primary.invoiceDate': 'Invoice date:',
  'rental.invoice.detail.primary.action.viewPdf': 'View PDF',

  'rental.invoice.detail.primary.menu.more': 'More',
  'rental.invoice.detail.primary.menu.issue': 'Issue',
  'rental.invoice.detail.primary.menu.regeneratePdf': 'Regenerate PDF',
  'rental.invoice.detail.primary.menu.markSentExternally': 'Record external delivery',
  'rental.invoice.detail.primary.menu.recordPayment': 'Record payment',

  'rental.invoice.detail.primary.relations.heading': 'Assignment',
  'rental.invoice.detail.primary.relations.template': 'Template',

  'rental.invoice.detail.primary.fallback.archived': 'Relation archived',
  'rental.invoice.detail.primary.fallback.deleted': 'Relation deleted',
  'rental.invoice.detail.primary.fallback.unavailable': 'Data unavailable',
  'rental.invoice.detail.primary.fallback.legacy': 'Legacy origin',

  'rental.invoice.detail.primary.permission.customer': 'No permission for customer details',
  'rental.invoice.detail.primary.permission.booking': 'No permission for booking details',
  'rental.invoice.detail.primary.permission.vehicle': 'No permission for vehicle details',
  'rental.invoice.detail.primary.permission.default': 'No permission',

  'rental.invoice.detail.primary.period.unknown': 'Period unknown',
  'rental.invoice.detail.primary.period.until': 'until {date}',
  'rental.invoice.detail.primary.period.from': 'from {date}',

  'rental.invoice.detail.primary.gate.issueNotDraft': 'Only drafts can be issued',
  'rental.invoice.detail.primary.gate.noPdfYet': 'No PDF available yet',
  'rental.invoice.detail.primary.gate.pdfAlreadyExists':
    'PDF already exists — use “Regenerate PDF” in the menu',
  'rental.invoice.detail.primary.gate.pdfOutgoingOnly': 'PDF generation only for outgoing invoices',
  'rental.invoice.detail.primary.gate.issueBeforePdf': 'Issue first, then generate PDF',
  'rental.invoice.detail.primary.gate.pdfTerminalState':
    'Not available for cancelled or closed special cases',
  'rental.invoice.detail.primary.gate.pdfTypeUnavailable':
    'PDF generation is currently only available for outgoing invoices',
  'rental.invoice.detail.primary.gate.emailAdminOnly': 'Only administrators can email invoices',
  'rental.invoice.detail.primary.gate.emailOutgoingOnly': 'Email delivery only for outgoing invoices',
  'rental.invoice.detail.primary.gate.issueFirst': 'Issue first',
  'rental.invoice.detail.primary.gate.emailNeedsPdf': 'PDF must be generated first',
  'rental.invoice.detail.primary.gate.regenerateBookingOnly': 'Only for booking invoices with PDF',
  'rental.invoice.detail.primary.gate.generatePdfFirst': 'Generate PDF first',
  'rental.invoice.detail.primary.gate.markSentState': 'Already sent or not yet issued',
  'rental.invoice.detail.primary.gate.outgoingOnly': 'Only for outgoing invoices',
  'rental.invoice.detail.primary.gate.paymentStatusBlocked': 'Not available for this status',
  'rental.invoice.detail.primary.gate.noOutstandingAmount': 'No outstanding amount',
  'rental.invoice.detail.primary.gate.editDraftOrReview': 'Edit only for drafts or invoices under review',
  'rental.invoice.detail.primary.gate.cancelNoPermission': 'No permission to cancel',
  'rental.invoice.detail.primary.gate.cancelStatusBlocked': 'Cancellation not available for this status',
} as const;
