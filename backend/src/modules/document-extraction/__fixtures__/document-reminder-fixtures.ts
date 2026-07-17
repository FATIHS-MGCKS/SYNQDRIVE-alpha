export const REMINDER_COMPLETE = {
  invoiceNumber: 'INV-2026-001',
  originalInvoiceReference: 'INV-2026-001',
  reminderLevel: 1,
  reminderDate: '2026-04-15',
  dueDate: '2026-04-09',
  overdueSince: '2026-04-10',
  currency: 'EUR',
  outstandingCents: 11900,
  totalCents: 11900,
  supplier: 'Werkstatt Demo GmbH',
  dunningFeeCents: 500,
  isReminder: true,
};

export const REMINDER_SECOND_LEVEL = {
  ...REMINDER_COMPLETE,
  reminderLevel: 2,
  reminderDate: '2026-05-01',
  dunningFeeCents: 1500,
};
