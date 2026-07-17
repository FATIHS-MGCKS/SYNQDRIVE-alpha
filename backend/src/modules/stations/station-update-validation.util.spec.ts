import { BadRequestException } from '@nestjs/common';
import {
  assertGenericStationUpdateAllowed,
  buildStationPatchWriteData,
  evaluateStationUpdatePayload,
  StationUpdateDomainCommand,
  StationUpdateValidationCode,
} from './station-update-validation.util';

describe('station-update-validation.util', () => {
  describe('evaluateStationUpdatePayload', () => {
    it('allows master data and operations fields', () => {
      const result = evaluateStationUpdatePayload({
        name: 'Updated',
        capacity: 10,
        managerName: 'Alex',
      });
      expect(result.violations).toHaveLength(0);
      expect(result.allowedFields).toEqual(
        expect.arrayContaining(['name', 'capacity', 'managerName']),
      );
      expect(result.auditHints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'name', command: 'UpdateStationMasterData' }),
          expect.objectContaining({ field: 'capacity', command: 'UpdateStationCapabilities' }),
          expect.objectContaining({ field: 'managerName', command: 'UpdateStationTeam' }),
        ]),
      );
    });

    it('rejects lifecycle fields with required domain command hints', () => {
      const result = evaluateStationUpdatePayload({ status: 'ARCHIVED' });
      expect(result.violations[0]).toMatchObject({
        field: 'status',
        code: StationUpdateValidationCode.FORBIDDEN_PATCH_FIELD,
        requiredCommand: StationUpdateDomainCommand.ARCHIVE,
        requiredEndpoint: 'POST /stations/:id/archive',
      });
    });

    it('rejects isPrimary with set-primary command hint', () => {
      const result = evaluateStationUpdatePayload({ isPrimary: true });
      expect(result.violations[0]?.requiredCommand).toBe(StationUpdateDomainCommand.SET_PRIMARY);
      expect(result.violations[0]?.requiredEndpoint).toBe('POST /stations/:id/set-primary');
    });

    it('rejects vehicle assignment fields on generic patch', () => {
      const result = evaluateStationUpdatePayload({ homeStationId: 'veh-1' });
      expect(result.violations[0]?.field).toBe('homeStationId');
      expect(result.violations[0]?.requiredCommand).toBe(StationUpdateDomainCommand.ASSIGN_HOME);
    });

    it('rejects pickup/return changes on archived stations', () => {
      const result = evaluateStationUpdatePayload(
        { pickupEnabled: true },
        { status: 'ARCHIVED', pickupEnabled: false, returnEnabled: false },
      );
      expect(result.violations[0]?.code).toBe(
        StationUpdateValidationCode.ARCHIVED_CAPABILITY_PATCH_FORBIDDEN,
      );
    });

    it('rejects unknown fields instead of silently ignoring them', () => {
      const result = evaluateStationUpdatePayload({ mysteryField: 'x' });
      expect(result.violations[0]?.code).toBe(StationUpdateValidationCode.UNKNOWN_PATCH_FIELD);
    });
  });

  describe('assertGenericStationUpdateAllowed', () => {
    it('throws on forbidden lifecycle patch', () => {
      expect(() => assertGenericStationUpdateAllowed({ status: 'INACTIVE' })).toThrow(
        BadRequestException,
      );
    });

    it('throws on empty patch', () => {
      try {
        assertGenericStationUpdateAllowed({});
      } catch (e) {
        expect((e as BadRequestException).getResponse()).toMatchObject({
          code: StationUpdateValidationCode.EMPTY_PATCH,
        });
      }
    });

    it('validates coordinate pair on allowed patch', () => {
      expect(() =>
        assertGenericStationUpdateAllowed({ name: 'X', latitude: 52.5 }),
      ).toThrow(BadRequestException);
    });
  });

  describe('buildStationPatchWriteData', () => {
    it('writes only allowed fields and omits forbidden lifecycle fields', () => {
      const data = buildStationPatchWriteData({
        name: 'Branch',
        status: 'ARCHIVED',
        isPrimary: true,
        capacity: 8,
      } as Record<string, unknown>);
      expect(data).toEqual({ name: 'Branch', capacity: 8 });
      expect(data.status).toBeUndefined();
      expect(data.isPrimary).toBeUndefined();
    });
  });
});
