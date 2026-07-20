import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { ServiceCasesController } from './service-cases.controller';

describe('ServiceCasesController', () => {
  const serviceCases = {
    list: jest.fn(),
    getDashboardSummary: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    complete: jest.fn(),
    cancel: jest.fn(),
    addComment: jest.fn(),
    addAttachment: jest.fn(),
    listForVehicle: jest.fn(),
    listForVendor: jest.fn(),
  };

  const controller = new ServiceCasesController(serviceCases as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies OrgScopingGuard and RolesGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ServiceCasesController);
    expect(guards).toEqual(expect.arrayContaining([OrgScopingGuard, RolesGuard]));
  });

  it('delegates paginated list to the service', async () => {
    const payload = { data: [], meta: { limit: 50, nextCursor: null } };
    serviceCases.list.mockResolvedValue(payload);

    await expect(controller.list('org-1', { limit: 50 } as any)).resolves.toEqual(payload);
    expect(serviceCases.list).toHaveBeenCalledWith('org-1', { limit: 50 });
  });

  it('delegates summary KPIs to the service', async () => {
    const summary = { open: 2, active: 5, blocksRental: 1 };
    serviceCases.getDashboardSummary.mockResolvedValue(summary);

    await expect(controller.summary('org-1')).resolves.toEqual(summary);
    expect(serviceCases.getDashboardSummary).toHaveBeenCalledWith('org-1');
  });
});
