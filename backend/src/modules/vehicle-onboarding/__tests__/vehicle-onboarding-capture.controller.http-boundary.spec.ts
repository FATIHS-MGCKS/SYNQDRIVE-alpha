import { UnprocessableEntityException, ConflictException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { VehicleOnboardingCaptureController } from '../controllers/vehicle-onboarding-capture.controller';
import { VEHICLE_ADMIN_BASELINE_DRAFT_VERSION } from '../contracts/vo-document-versions';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

describe('VehicleOnboardingCaptureController HTTP boundary', () => {
  const orgId = randomUUID();
  const caseId = randomUUID();
  const req = { user: { id: 'actor-1' } } as any;

  const captureService = {
    listCases: jest.fn(),
    getCase: jest.fn(),
    updateAdminBaseline: jest.fn(),
    updateTechnicalBaseline: jest.fn(),
    evaluateReadinessPreview: jest.fn(),
    sealReadiness: jest.fn(),
  };

  const controller = new VehicleOnboardingCaptureController(captureService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function expect422(fn: () => Promise<unknown>) {
    return expect(fn()).rejects.toBeInstanceOf(UnprocessableEntityException);
  }

  describe('GET cases list query', () => {
    it('returns 422 for invalid status', async () => {
      await expect422(() => controller.listCases(orgId, 'BROKEN'));
      expect(captureService.listCases).not.toHaveBeenCalled();
    });

    it('returns 422 for invalid sourceMode', async () => {
      await expect422(() => controller.listCases(orgId, undefined, 'BROKEN'));
    });

    it('returns 422 for limit=abc', async () => {
      await expect422(() => controller.listCases(orgId, undefined, undefined, 'abc'));
    });

    it('returns 422 for limit=10abc', async () => {
      await expect422(() => controller.listCases(orgId, undefined, undefined, '10abc'));
    });

    it('returns 422 for limit=101', async () => {
      await expect422(() => controller.listCases(orgId, undefined, undefined, '101'));
    });

    it('returns 422 for invalid cursor', async () => {
      await expect422(() => controller.listCases(orgId, undefined, undefined, undefined, 'not-a-uuid'));
    });

    it('accepts valid limit and delegates', async () => {
      captureService.listCases.mockResolvedValue({ items: [], nextCursor: null });
      await controller.listCases(orgId, undefined, undefined, '25');
      expect(captureService.listCases).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ limit: 25 }),
      );
    });
  });

  describe('mutation bodies', () => {
    const adminPayload = {
      version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
      vehicleName: 'X',
      licensePlate: null,
      stationId: null,
      notes: null,
    };

    it('admin baseline missing concurrency token → 422', async () => {
      await expect422(() =>
        controller.updateAdminBaseline(orgId, caseId, adminPayload, req),
      );
    });

    it('technical baseline missing concurrency token → 422', async () => {
      await expect422(() =>
        controller.updateTechnicalBaseline(orgId, caseId, { version: 2 }, req),
      );
    });

    it('seal missing concurrency token → 422', async () => {
      await expect422(() =>
        controller.sealReadiness(orgId, caseId, { selectedProduct: ProductSlug.RENTAL }, req),
      );
    });

    it('rejects null body → 422', async () => {
      await expect422(() => controller.updateAdminBaseline(orgId, caseId, null, req));
    });

    it('rejects array body → 422', async () => {
      await expect422(() => controller.updateAdminBaseline(orgId, caseId, [], req));
    });

    it('rejects invalid concurrency token type → 422', async () => {
      await expect422(() =>
        controller.updateTechnicalBaseline(
          orgId,
          caseId,
          { version: 2, expectedConcurrencyToken: 123 },
          req,
        ),
      );
    });

    it('stale concurrency token → 409', async () => {
      captureService.updateTechnicalBaseline.mockRejectedValue(
        new VehicleOnboardingError('ONBOARDING_CONCURRENCY_CONFLICT', 'stale'),
      );
      await expect(
        controller.updateTechnicalBaseline(
          orgId,
          caseId,
          { version: 2, expectedConcurrencyToken: 'stale-token' },
          req,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('readiness bodies', () => {
    it('evaluate invalid selectedProduct → 422', async () => {
      await expect422(() =>
        controller.evaluateReadiness(orgId, caseId, { selectedProduct: 'NOT_A_PRODUCT' }, req),
      );
    });

    it('evaluate unknown field → 422', async () => {
      await expect422(() =>
        controller.evaluateReadiness(
          orgId,
          caseId,
          { selectedProduct: ProductSlug.RENTAL, profileVersion: 'force-me' },
          req,
        ),
      );
    });

    it('evaluate TAXI delegates profile unsupported to service mapper', async () => {
      captureService.evaluateReadinessPreview.mockRejectedValue(
        new VehicleOnboardingError('READINESS_PROFILE_UNSUPPORTED', 'unsupported'),
      );
      await expect422(() =>
        controller.evaluateReadiness(orgId, caseId, { selectedProduct: ProductSlug.TAXI }, req),
      );
      expect(captureService.evaluateReadinessPreview).toHaveBeenCalled();
    });

    it('seal unknown field → 422', async () => {
      await expect422(() =>
        controller.sealReadiness(
          orgId,
          caseId,
          {
            selectedProduct: ProductSlug.RENTAL,
            expectedConcurrencyToken: 'tok',
            override: true,
          },
          req,
        ),
      );
      expect(captureService.sealReadiness).not.toHaveBeenCalled();
    });
  });
});
