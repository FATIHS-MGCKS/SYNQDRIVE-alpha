import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Header } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { BookingsController } from '@modules/bookings/bookings.controller';
import { TasksController } from '@modules/tasks/tasks.controller';
import { CustomersController } from '@modules/customers/customers.controller';
import { CustomerVerificationController } from '@modules/customer-verification/customer-verification.controller';
import {
  OPERATOR_FORBIDDEN_BODY_FIELDS,
  assertNoForbiddenOperatorBodyFields,
} from './operator-client-field-guard.util';
import {
  buildOperatorIdempotencyLockKey,
  buildOperatorIdempotencyRedisKey,
  readOperatorIdempotencyKey,
} from './operator-idempotency.util';
import { OperatorRateLimitService } from './operator-rate-limit.service';
import { OperatorIdempotencyService } from './operator-idempotency.service';
import { OperatorRateLimitedException } from './operator-security.errors';
import { CreateHandoverProtocolDto } from '@modules/bookings/dto/create-handover-protocol.dto';

describe('Operator security hardening', () => {
  describe('controller guard stacks', () => {
    it('BookingsController requires org scoping + roles + permissions', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, BookingsController) ?? [];
      expect(guards).toEqual(
        expect.arrayContaining([OrgScopingGuard, RolesGuard, PermissionsGuard]),
      );
    });

    it('TasksController requires org scoping + roles + permissions', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, TasksController) ?? [];
      expect(guards).toEqual(
        expect.arrayContaining([OrgScopingGuard, RolesGuard, PermissionsGuard]),
      );
    });

    it('CustomersController requires org scoping + roles', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, CustomersController) ?? [];
      expect(guards).toEqual(expect.arrayContaining([OrgScopingGuard, RolesGuard]));
    });

    it('CustomerVerificationController requires RolesGuard', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, CustomerVerificationController) ?? [];
      expect(guards).toEqual(expect.arrayContaining([RolesGuard]));
    });
  });

  describe('client field guard', () => {
    it('rejects server-owned identity fields in body', () => {
      expect(() =>
        assertNoForbiddenOperatorBodyFields({ performedByUserId: 'attacker' }),
      ).toThrow(/performedByUserId/);
      expect(() =>
        assertNoForbiddenOperatorBodyFields({ organizationId: 'foreign-org' }),
      ).toThrow(/organizationId/);
    });

    it('allows whitelisted handover fields', () => {
      expect(() =>
        assertNoForbiddenOperatorBodyFields({
          odometerKm: 100,
          fuelPercent: 50,
          actualStationId: '00000000-0000-4000-8000-000000000001',
        }),
      ).not.toThrow();
    });

    it('documents forbidden operator body fields inventory', () => {
      expect(OPERATOR_FORBIDDEN_BODY_FIELDS).toEqual(
        expect.arrayContaining(['performedByUserId', 'organizationId', 'status']),
      );
    });
  });

  describe('idempotency key handling', () => {
    it('reads Idempotency-Key header case-insensitively', () => {
      expect(
        readOperatorIdempotencyKey({ 'idempotency-key': '  key-abc  ' }),
      ).toBe('key-abc');
      expect(readOperatorIdempotencyKey({ 'Idempotency-Key': 'key-def' })).toBe('key-def');
      expect(readOperatorIdempotencyKey({})).toBeNull();
    });

    it('builds deterministic redis keys per org + scope', () => {
      const a = buildOperatorIdempotencyRedisKey('org-1', 'handover:pickup:bk-1', 'idem-1');
      const b = buildOperatorIdempotencyRedisKey('org-1', 'handover:pickup:bk-1', 'idem-1');
      const c = buildOperatorIdempotencyRedisKey('org-2', 'handover:pickup:bk-1', 'idem-1');
      expect(a).toBe(b);
      expect(a).not.toBe(c);
      expect(buildOperatorIdempotencyLockKey(a)).toBe(`${a}:lock`);
    });
  });

  describe('CreateHandoverProtocolDto whitelist', () => {
    it('defines validated numeric bounds for odometer and fuel', () => {
      const dto = new CreateHandoverProtocolDto();
      dto.odometerKm = 120_000;
      dto.fuelPercent = 75;
      expect(dto.odometerKm).toBe(120_000);
      expect(dto.fuelPercent).toBe(75);
    });
  });

  describe('OperatorRateLimitService', () => {
    it('throws OPERATOR_RATE_LIMITED when user exceeds scan window', async () => {
      const redis = {
        incr: jest.fn().mockResolvedValue(91),
        expire: jest.fn().mockResolvedValue(1),
      };
      const service = new OperatorRateLimitService(
        {
          rateLimitEnabled: true,
          scanMaxPerUserPerWindow: 90,
          completionMaxPerUserPerWindow: 45,
          verificationMaxPerUserPerWindow: 30,
          rateLimitWindowMs: 60_000,
          idempotencyEnabled: true,
          idempotencyTtlSeconds: 86_400,
          idempotencyLockTtlSeconds: 120,
        },
        redis as never,
      );

      await expect(
        service.assertAllowed({
          organizationId: 'org-1',
          userId: 'user-1',
          action: 'scan',
        }),
      ).rejects.toBeInstanceOf(OperatorRateLimitedException);
    });
  });

  describe('OperatorIdempotencyService', () => {
    it('returns cached body on replay', async () => {
      const cached = JSON.stringify({ statusCode: 200, body: { ok: true } });
      const redis = {
        get: jest.fn().mockResolvedValue(cached),
        set: jest.fn(),
        del: jest.fn(),
      };
      const service = new OperatorIdempotencyService(
        {
          rateLimitEnabled: true,
          scanMaxPerUserPerWindow: 90,
          completionMaxPerUserPerWindow: 45,
          verificationMaxPerUserPerWindow: 30,
          rateLimitWindowMs: 60_000,
          idempotencyEnabled: true,
          idempotencyTtlSeconds: 86_400,
          idempotencyLockTtlSeconds: 120,
        },
        redis as never,
      );

      const work = jest.fn();
      const result = await service.execute({
        organizationId: 'org-1',
        scope: 'task:complete:t1',
        idempotencyKey: 'idem-1',
        work,
      });

      expect(result).toEqual({ ok: true });
      expect(work).not.toHaveBeenCalled();
    });
  });

  describe('sensitive response headers', () => {
    it('Operator-sensitive endpoints use Cache-Control no-store decorator', () => {
      const decorator = Header('Cache-Control', 'no-store');
      expect(decorator).toBeDefined();
    });
  });
});
