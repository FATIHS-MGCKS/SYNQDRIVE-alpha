import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DocumentExtractionService } from './document-extraction.service';

/**
 * These tests exercise the parts of DocumentExtractionService that do NOT touch
 * the queue/storage: confirmedData schema validation, the cross-vehicle IDOR
 * guard, and confirm() idempotency (apply exactly once, never auto-apply).
 */
describe('DocumentExtractionService', () => {
  function makeService(
    prismaOverrides: any = {},
    applyService: any = { apply: jest.fn().mockResolvedValue({}) },
  ) {
    const prisma = {
      vehicleDocumentExtraction: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        ...prismaOverrides,
      },
      vehicle: { findUnique: jest.fn() },
    };
    const config = { get: jest.fn((_k: string, d?: unknown) => d) };
    const storage = { putObject: jest.fn(), getObject: jest.fn(), deleteObject: jest.fn() };
    const queue = { add: jest.fn() };
    const svc = new DocumentExtractionService(
      prisma as any,
      config as any,
      storage as any,
      queue as any,
      applyService as any,
    );
    return { svc, prisma, applyService };
  }

  describe('sanitizeConfirmedData', () => {
    it('keeps known schema keys + apply aliases and drops unknown keys', () => {
      const { svc } = makeService();
      const out = svc.sanitizeConfirmedData('SERVICE', {
        eventDate: '2026-01-10',
        odometerKm: 50000,
        costCents: 12900,
        invoiceNumber: 'R-1',
        notes: 'alias-kept',
        injected: 'DROP ME',
        __proto__: 'nope',
      });
      expect(out).toMatchObject({
        eventDate: '2026-01-10',
        odometerKm: 50000,
        costCents: 12900,
        invoiceNumber: 'R-1',
        notes: 'alias-kept',
      });
      expect(out).not.toHaveProperty('injected');
    });

    it('coerces an invalid enum value to null and keeps valid enum values', () => {
      const { svc } = makeService();
      expect(svc.sanitizeConfirmedData('BRAKE', { serviceKind: 'bogus' }).serviceKind).toBeNull();
      expect(svc.sanitizeConfirmedData('BRAKE', { serviceKind: 'pads_service' }).serviceKind).toBe(
        'pads_service',
      );
    });

    it('preserves nested measurement objects (treadDepthMm)', () => {
      const { svc } = makeService();
      const out = svc.sanitizeConfirmedData('TIRE', {
        treadDepthMm: { fl: 5, fr: 5, rl: 4, rr: 4 },
      });
      expect(out.treadDepthMm).toEqual({ fl: 5, fr: 5, rl: 4, rr: 4 });
    });

    it('throws when confirmedData is not a plain object', () => {
      const { svc } = makeService();
      expect(() => svc.sanitizeConfirmedData('SERVICE', null)).toThrow(BadRequestException);
      expect(() => svc.sanitizeConfirmedData('SERVICE', [])).toThrow(BadRequestException);
      expect(() => svc.sanitizeConfirmedData('SERVICE', 'x' as any)).toThrow(BadRequestException);
    });
  });

  describe('getForVehicle (cross-vehicle IDOR guard)', () => {
    it('throws NotFound when the extraction belongs to a different vehicle', async () => {
      const { svc } = makeService({
        findUnique: jest.fn().mockResolvedValue({ id: 'e1', vehicleId: 'OTHER-VEHICLE' }),
      });
      await expect(svc.getForVehicle('my-vehicle', 'e1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the record when the vehicle matches', async () => {
      const record = { id: 'e1', vehicleId: 'my-vehicle', status: 'READY_FOR_REVIEW' };
      const { svc } = makeService({ findUnique: jest.fn().mockResolvedValue(record) });
      await expect(svc.getForVehicle('my-vehicle', 'e1')).resolves.toBe(record);
    });
  });

  describe('confirm', () => {
    it('is idempotent — does not re-apply an already APPLIED extraction', async () => {
      const applied = { id: 'e1', vehicleId: 'v1', documentType: 'SERVICE', status: 'APPLIED' };
      const apply = jest.fn();
      const { svc, prisma } = makeService(
        { findUnique: jest.fn().mockResolvedValue(applied) },
        { apply },
      );
      const result = await svc.confirm('v1', 'e1', { eventDate: '2026-01-10' });
      expect(result).toBe(applied);
      expect(apply).not.toHaveBeenCalled();
      expect(prisma.vehicleDocumentExtraction.update).not.toHaveBeenCalled();
    });

    it('applies confirmed data exactly once and transitions to APPLIED', async () => {
      const record = {
        id: 'e1',
        vehicleId: 'v1',
        documentType: 'SERVICE',
        status: 'READY_FOR_REVIEW',
        sourceFileUrl: null,
      };
      const apply = jest.fn().mockResolvedValue({ serviceEventId: 'svc-1' });
      const update = jest
        .fn()
        .mockImplementation(({ data }: any) => Promise.resolve({ ...record, ...data }));
      const { svc } = makeService(
        { findUnique: jest.fn().mockResolvedValue(record), update },
        { apply },
      );

      const result: any = await svc.confirm('v1', 'e1', {
        eventDate: '2026-01-10',
        odometerKm: 50000,
        injected: 'DROP ME',
      });

      // Applied exactly once with sanitized confirmedData (no unknown keys).
      expect(apply).toHaveBeenCalledTimes(1);
      const applyArg = apply.mock.calls[0][0];
      expect(applyArg.confirmedData).not.toHaveProperty('injected');
      expect(applyArg.confirmedData.eventDate).toBe('2026-01-10');

      // CONFIRMED first (audit), then APPLIED with appliedAt set.
      expect(update).toHaveBeenCalledTimes(2);
      expect(update.mock.calls[0][0].data.status).toBe('CONFIRMED');
      expect(update.mock.calls[1][0].data.status).toBe('APPLIED');
      expect(update.mock.calls[1][0].data.appliedAt).toBeInstanceOf(Date);
      expect(result.status).toBe('APPLIED');
    });
  });
});
