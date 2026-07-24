import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { EvaluationsFxRateService } from './evaluations-fx-rate.service';

describe('EvaluationsFxRateService', () => {
  function buildService(prisma: {
    organizationPaymentAccount: { findFirst: jest.Mock };
    priceBook: { findFirst: jest.Mock };
  }) {
    const module = Test.createTestingModule({
      providers: [EvaluationsFxRateService, { provide: PrismaService, useValue: prisma }],
    });
    return module.compile().then((m) => m.get(EvaluationsFxRateService));
  }

  it('resolves reporting currency from payment account', async () => {
    const prisma = {
      organizationPaymentAccount: {
        findFirst: jest.fn().mockResolvedValue({ defaultCurrency: 'GBP' }),
      },
      priceBook: { findFirst: jest.fn().mockResolvedValue({ currency: 'EUR' }) },
    };
    const service = await buildService(prisma);
    const resolution = await service.resolveReportingCurrency('org-1');
    expect(resolution).toEqual({ currency: 'GBP', source: 'payment_account_default' });
  });

  it('creates analytics FX context when currency configured', async () => {
    const prisma = {
      organizationPaymentAccount: {
        findFirst: jest.fn().mockResolvedValue({ defaultCurrency: 'EUR' }),
      },
      priceBook: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = await buildService(prisma);
    const { fxContext, resolution } = await service.getAnalyticsContextForOrg('org-1');
    expect(resolution.currency).toBe('EUR');
    expect(fxContext).not.toBeNull();
    expect(fxContext?.reportingCurrency).toBe('EUR');
  });

  it('returns null fx context when org currency unconfigured', async () => {
    const prisma = {
      organizationPaymentAccount: { findFirst: jest.fn().mockResolvedValue(null) },
      priceBook: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = await buildService(prisma);
    const resolution = { currency: null, source: 'unconfigured' as const };
    const ctx = service.createAnalyticsContext(resolution);
    expect(ctx).toBeNull();
  });
});
