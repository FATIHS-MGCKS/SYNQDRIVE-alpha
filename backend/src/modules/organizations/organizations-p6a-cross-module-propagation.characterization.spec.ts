/**
 * P6A — cross-module lifecycle propagation evidence (characterization, no guard mocks).
 */
import { BillingBillableVehicleAssignmentStatus, OrganizationStatus, OrgProductStatus } from '@prisma/client';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  BillableVehicleExclusionReason,
  evaluateBillableVehiclePolicy,
  type BillableVehiclePolicyContext,
} from '@modules/billing/domain/billable-vehicle-policy';
import { resolveEntitlementCapabilities } from '@modules/products/entitlements/entitlements-policy';
import { buildOrganizationAttention } from './organization-attention.util';

function billableContext(
  partial: Partial<BillableVehiclePolicyContext> &
    Pick<BillableVehiclePolicyContext, 'vehicles'>,
): BillableVehiclePolicyContext {
  return {
    organizationId: 'org-1',
    organizationActive: true,
    baseSubscriptionItemId: 'item-base',
    baseSubscriptionItemActive: true,
    asOf: new Date('2026-08-15'),
    legacyImplicitAssignments: false,
    assignments: [],
    ...partial,
  };
}

describe('P6A Scenario A — organization SUSPENDED vs billing telemetry policy', () => {
  it('billable vehicle policy excludes SUSPENDED org (quantity/billing only)', () => {
    const result = evaluateBillableVehiclePolicy(
      billableContext({
        organizationActive: false,
        vehicles: [
          {
            id: 'v1',
            organizationId: 'org-1',
            licensePlate: 'B-AB 1',
            vin: 'VIN1',
            make: 'VW',
            model: 'ID.3',
            registryLifecycle: 'ACTIVE',
          },
        ],
        assignments: [
          {
            id: 'a1',
            organizationId: 'org-1',
            vehicleId: 'v1',
            subscriptionItemId: 'item-base',
            billableFrom: new Date('2026-01-01'),
            billableUntil: null,
            status: BillingBillableVehicleAssignmentStatus.ACTIVE,
            reasonCode: null,
            reasonNote: null,
            approvedByUserId: 'user-1',
          },
        ],
      }),
    );
    expect(result.billableVehicleCount).toBe(0);
    expect(result.excludedVehicles[0].reason).toBe(BillableVehicleExclusionReason.ORG_INACTIVE);
  });
});

describe('P6A Scenario B — product non-operational entitlement', () => {
  it('TRIAL product allows UI capability but blocks vehicle activation', () => {
    const caps = resolveEntitlementCapabilities(OrgProductStatus.TRIAL);
    expect(caps.canAccessProductUi).toBe(true);
    expect(caps.canActivateVehicles).toBe(false);
  });

  it('SUSPENDED product license denies operational UI and activation', () => {
    const caps = resolveEntitlementCapabilities(OrgProductStatus.SUSPENDED);
    expect(caps).toEqual({ canAccessProductUi: false, canActivateVehicles: false });
  });
});

describe('P6A Scenario C — billing PAST_DUE vs organization status (intentional decouple)', () => {
  it('PAST_DUE surfaces as billing attention without forcing ORG_SUSPENDED chip', () => {
    const attention = buildOrganizationAttention({
      orgStatus: OrganizationStatus.ACTIVE,
      billingWarnings: ['PAST_DUE'],
      syncStatus: 'SYNCED',
      hasActiveSubscription: true,
      hasIntegrationError: false,
      connectivityHealth: 'ok',
      hasReconciliationDrift: false,
    });
    expect(attention.reasons).toContain('PAST_DUE');
    expect(attention.reasons).not.toContain('ORG_SUSPENDED');
  });

  it('ORG_SUSPENDED attention is independent of billing warnings', () => {
    const attention = buildOrganizationAttention({
      orgStatus: OrganizationStatus.SUSPENDED,
      billingWarnings: [],
      syncStatus: 'SYNCED',
      hasActiveSubscription: true,
      hasIntegrationError: false,
      connectivityHealth: 'ok',
      hasReconciliationDrift: false,
    });
    expect(attention.reasons).toContain('ORG_SUSPENDED');
    expect(attention.reasons).not.toContain('PAST_DUE');
  });
});

describe('P6A Scenario D — vehicle OFFBOARDED billing/registry', () => {
  it('OFFBOARDED registry lifecycle is excluded from billable quantity', () => {
    const result = evaluateBillableVehiclePolicy(
      billableContext({
        vehicles: [
          {
            id: 'v-off',
            organizationId: 'org-1',
            licensePlate: 'B-AB 2',
            vin: 'VIN2',
            make: 'VW',
            model: 'ID.4',
            registryLifecycle: 'OFFBOARDED',
          },
        ],
        assignments: [
          {
            id: 'a2',
            organizationId: 'org-1',
            vehicleId: 'v-off',
            subscriptionItemId: 'item-base',
            billableFrom: new Date('2026-01-01'),
            billableUntil: null,
            status: BillingBillableVehicleAssignmentStatus.ACTIVE,
            reasonCode: null,
            reasonNote: null,
            approvedByUserId: 'user-1',
          },
        ],
      }),
    );
    expect(result.billableVehicleCount).toBe(0);
    expect(result.excludedVehicles[0].reason).toBe(BillableVehicleExclusionReason.REGISTRY_OFFBOARDED);
  });
});

/** PARTIAL evidence: controller source files only, not per-route runtime guard execution. */
describe('P6A — ProductLicenseGuard HTTP surfaces (static pairing inventory)', () => {
  const modulesRoot = join(__dirname, '..');

  function listControllerFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.controller.ts')) out.push(full);
      }
    };
    walk(modulesRoot);
    return out;
  }

  it('PARTIAL: every controller file using ProductLicenseGuard also references OrgScopingGuard in source', () => {
    const missing: string[] = [];
    for (const file of listControllerFiles()) {
      const src = readFileSync(file, 'utf8');
      if (!src.includes('ProductLicenseGuard')) continue;
      if (!src.includes('OrgScopingGuard')) {
        missing.push(file.replace(modulesRoot, ''));
      }
    }
    expect(missing).toEqual([]);
  });
});