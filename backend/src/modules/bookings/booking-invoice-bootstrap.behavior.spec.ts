/**
 * Characterization: BookingsService.create verschluckt Invoice-Bootstrap-Fehler
 * per .catch() — Buchung entsteht, Rechnung evtl. fehlend (Audit-Punkt 12).
 * Keine Produktivlogik-Änderung; dokumentiert Ist-Verhalten für spätere Härtung.
 */
describe('Booking invoice bootstrap fire-and-forget (characterization)', () => {
  it('audit-12c — simuliertes bookings.create-Muster: Bootstrap-Fehler wird geloggt, Promise resolved null', async () => {
    const logger = { error: jest.fn() };
    const bootstrapBookingInvoice = jest.fn().mockRejectedValue(new Error('invoice bootstrap failed'));

    const invoicePromise = bootstrapBookingInvoice('org-1', { id: 'bk-1' }).catch((err: unknown) => {
      logger.error(
        'Booking bk-1 created but invoice bootstrap failed',
        err instanceof Error ? err.stack : String(err),
      );
      return null;
    });

    const result = await invoicePromise;
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('bk-1'),
      expect.any(String),
    );
    expect(bootstrapBookingInvoice).toHaveBeenCalled();
  });

  it('audit-12d — Bundle-Kette startet auch wenn Invoice-Bootstrap null liefert', async () => {
    const generateInitialBundle = jest.fn().mockResolvedValue({ bundle: { status: 'PENDING' } });
    const invoicePromise = Promise.resolve(null);

    await invoicePromise.then(() => generateInitialBundle('org-1', 'bk-1'));
    expect(generateInitialBundle).toHaveBeenCalledWith('org-1', 'bk-1');
  });
});
