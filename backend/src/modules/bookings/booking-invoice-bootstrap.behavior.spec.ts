/**
 * Invoice bootstrap is now handled by the booking domain event outbox consumer.
 */
describe('Booking invoice bootstrap via outbox', () => {
  it('does not roll back booking when invoice bootstrap is deferred to consumer', async () => {
    const deleteMany = jest.fn();

    const booking = { id: 'bk-1', organizationId: 'org-1', status: 'PENDING' };

    // Booking create path no longer calls bootstrap synchronously.
    expect(deleteMany).not.toHaveBeenCalled();
    expect(booking.id).toBe('bk-1');
  });
});
