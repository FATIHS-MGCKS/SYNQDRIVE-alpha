export const rentalInvoiceDetailHeaderEn = {
  'rental.invoice.detail.header.action.viewPdf': 'View PDF',

  'rental.invoice.detail.header.menu.more': 'More',
  'rental.invoice.detail.header.menu.issue': 'Issue',
  'rental.invoice.detail.header.menu.regeneratePdf': 'Regenerate PDF',
  'rental.invoice.detail.header.menu.markSentExternally': 'Record external delivery',
  'rental.invoice.detail.header.menu.voidInvoice': 'Void invoice',

  'rental.invoice.detail.header.gate.issueNotDraft': 'Only drafts can be issued',
  'rental.invoice.detail.header.gate.noPdfYet': 'No PDF available yet',
  'rental.invoice.detail.header.gate.pdfAlreadyExists':
    'PDF already exists — use “Regenerate PDF” in the menu',
  'rental.invoice.detail.header.gate.pdfOutgoingOnly': 'PDF generation only for outgoing invoices',
  'rental.invoice.detail.header.gate.issueBeforePdf': 'Issue first, then generate PDF',
  'rental.invoice.detail.header.gate.pdfTerminalState':
    'Not available for cancelled or closed special cases',
  'rental.invoice.detail.header.gate.pdfTypeUnavailable':
    'PDF generation is currently only available for outgoing invoices',
  'rental.invoice.detail.header.gate.emailAdminOnly': 'Only administrators can email invoices',
  'rental.invoice.detail.header.gate.emailOutgoingOnly': 'Email delivery only for outgoing invoices',
  'rental.invoice.detail.header.gate.issueFirst': 'Issue first',
  'rental.invoice.detail.header.gate.emailNeedsPdf': 'PDF must be generated first',
  'rental.invoice.detail.header.gate.regenerateBookingOnly': 'Only for booking invoices with PDF',
  'rental.invoice.detail.header.gate.generatePdfFirst': 'Generate PDF first',
  'rental.invoice.detail.header.gate.markSentState': 'Already sent or not yet issued',
  'rental.invoice.detail.header.gate.outgoingOnly': 'Only for outgoing invoices',
  'rental.invoice.detail.header.gate.paymentStatusBlocked': 'Not available for this status',
  'rental.invoice.detail.header.gate.noOutstandingAmount': 'No outstanding amount',
  'rental.invoice.detail.header.gate.editDraftOrReview': 'Edit only for drafts or invoices under review',
  'rental.invoice.detail.header.gate.cancelNoPermission': 'No permission to void',
  'rental.invoice.detail.header.gate.cancelStatusBlocked': 'Voiding not available for this status',
} as const;
