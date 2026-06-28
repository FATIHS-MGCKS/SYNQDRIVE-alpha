import { api, type CustomerApiRecord } from '../../lib/api';
import { customerStatusUiToApi, type CustomerUiStatus } from './entityMappers';

/** Status changes must use PATCH .../customers/:id/status — never the generic update DTO. */
export async function changeCustomerStatus(
  orgId: string,
  customerId: string,
  nextUiStatus: CustomerUiStatus | string,
  reason?: string,
): Promise<CustomerApiRecord> {
  return api.customers.updateStatus(orgId, customerId, {
    status: customerStatusUiToApi(nextUiStatus),
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
  });
}

/** Risk changes must use PATCH .../customers/:id/risk — not the generic update DTO. */
export async function changeCustomerRisk(
  orgId: string,
  customerId: string,
  riskLevel: string,
  riskReason?: string,
): Promise<CustomerApiRecord> {
  return api.customers.updateRisk(orgId, customerId, {
    riskLevel,
    ...(riskReason?.trim() ? { riskReason: riskReason.trim() } : {}),
  });
}
