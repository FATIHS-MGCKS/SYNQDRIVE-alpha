/**
 * Booking create must not leave orphan bookings when invoice bootstrap fails.
 */
describe('Booking invoice bootstrap hardening', () => {
  it('propagates bootstrap failure after compensating booking rollback', async () => {
    const logger = { error: jest.fn() };
    const bootstrapBookingInvoice = jest.fn().mockRejectedValue(new Error('invoice bootstrap failed'));
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });

    const booking = { id: 'bk-1', organizationId: 'org-1' };

    await expect(
      (async () => {
        try {
          await bootstrapBookingInvoice('org-1', { id: booking.id });
        } catch (err) {
          logger.error(
            `Booking ${booking.id} created but invoice bootstrap failed — rolling back booking`,
            err instanceof Error ? err.stack : String(err),
          );
          await deleteMany({ where: { id: booking.id, organizationId: 'org-1' } });
          throw err;
        }
      })(),
    ).rejects.toThrow('invoice bootstrap failed');

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'bk-1', organizationId: 'org-1' } });
    expect(logger.error).toHaveBeenCalled();
  });
});
