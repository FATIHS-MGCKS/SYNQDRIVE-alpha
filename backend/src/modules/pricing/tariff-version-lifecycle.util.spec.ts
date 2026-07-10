import { BadRequestException } from '@nestjs/common';
import {
  assertTariffStatusTransition,
  assertTariffVersionEditable,
  assertTariffVersionPublishable,
  resolvePublishTargetStatus,
} from './tariff-version-lifecycle.util';
import { PriceTariffVersionStatus } from '@prisma/client';

describe('tariff-version-lifecycle.util', () => {
  describe('assertTariffVersionEditable', () => {
    it('allows DRAFT', () => {
      expect(() => assertTariffVersionEditable('DRAFT')).not.toThrow();
    });

    it.each(['ACTIVE', 'ARCHIVED', 'SCHEDULED'] as PriceTariffVersionStatus[])(
      'rejects %s',
      (status) => {
        expect(() => assertTariffVersionEditable(status)).toThrow(BadRequestException);
      },
    );
  });

  describe('assertTariffVersionPublishable', () => {
    it('allows DRAFT', () => {
      expect(() => assertTariffVersionPublishable('DRAFT')).not.toThrow();
    });

    it('rejects ACTIVE', () => {
      expect(() => assertTariffVersionPublishable('ACTIVE')).toThrow(BadRequestException);
    });
  });

  describe('resolvePublishTargetStatus', () => {
    const now = new Date('2026-08-01T10:00:00.000Z');

    it('returns ACTIVE when effectiveFrom is now or past', () => {
      expect(resolvePublishTargetStatus(now, now)).toBe('ACTIVE');
      expect(resolvePublishTargetStatus(new Date('2026-07-01'), now)).toBe('ACTIVE');
    });

    it('returns SCHEDULED when effectiveFrom is in the future', () => {
      expect(resolvePublishTargetStatus(new Date('2026-09-01'), now)).toBe('SCHEDULED');
    });
  });

  describe('assertTariffStatusTransition', () => {
    it('allows DRAFT → ACTIVE', () => {
      expect(() => assertTariffStatusTransition('DRAFT', 'ACTIVE')).not.toThrow();
    });

    it('forbids ACTIVE → DRAFT', () => {
      expect(() => assertTariffStatusTransition('ACTIVE', 'DRAFT')).toThrow(BadRequestException);
    });

    it('forbids ARCHIVED → ACTIVE', () => {
      expect(() => assertTariffStatusTransition('ARCHIVED', 'ACTIVE')).toThrow(BadRequestException);
    });
  });
});
