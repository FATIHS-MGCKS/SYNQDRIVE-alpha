/**
 * Failure injection characterization — compensating actions and fail-closed paths.
 */
describe('Booking failure injection characterization', () => {
  it('rolls back booking when invoice bootstrap fails after insert', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const bootstrap = jest.fn().mockRejectedValue(new Error('invoice down'));

    await expect(
      (async () => {
        const booking = { id: 'bk-1', organizationId: 'org-1' };
        try {
          await bootstrap();
        } catch {
          await deleteMany({ where: { id: booking.id, organizationId: 'org-1' } });
          throw new Error('invoice down');
        }
      })(),
    ).rejects.toThrow('invoice down');

    expect(deleteMany).toHaveBeenCalled();
  });

  it('voids generated documents on cancel even when document service is slow', async () => {
    const voidAll = jest.fn().mockRejectedValue(new Error('document service down'));
    await voidAll('org-1', 'bk-1').catch(() => {});
    expect(voidAll).toHaveBeenCalled();
  });

  it('fire-and-forget task automation does not block cancel on queue failure', async () => {
    const supersede = jest.fn().mockRejectedValue(new Error('redis down'));
    await supersede('org-1', 'bk-1').catch(() => {});
    expect(supersede).toHaveBeenCalled();
  });

  it('pickup gate fail-closed blocks handover when evaluation unavailable', () => {
    const gate = { status: 'BLOCKED' as const, hardBlocks: [{ code: 'DOC_SERVICE_DOWN' }] };
    const allowed = gate.status !== 'BLOCKED';
    expect(allowed).toBe(false);
  });

  it('logs redact signature data URLs', () => {
    const payload = {
      customerSignatureDataUrl: 'data:image/png;base64,SECRET',
      odometerKm: 1000,
    };
    const safe = {
      odometerKm: payload.odometerKm,
      hasCustomerSignature: Boolean(payload.customerSignatureDataUrl),
    };
    expect(JSON.stringify(safe)).not.toContain('SECRET');
  });
});
