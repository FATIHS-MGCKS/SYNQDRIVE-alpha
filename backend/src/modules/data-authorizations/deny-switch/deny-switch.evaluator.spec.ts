import { DENY_SWITCH_REASON, DENY_SWITCH_SCOPE } from './deny-switch.constants';
import {
  evaluateDenySwitchLocal,
  isQueueEnqueueDeniedLocal,
  rowToLocalEntry,
} from './deny-switch.evaluator';
import { DenySwitchLocalStore } from './deny-switch.local-store';
import type { DenySwitchLocalEntry } from './deny-switch.types';
import { AUTHORIZATION_DECISION_ACTION } from '../authorization-decision-engine/authorization-decision.constants';

function entry(
  overrides: Partial<DenySwitchLocalEntry> & Pick<DenySwitchLocalEntry, 'organizationId' | 'scopeType'>,
): DenySwitchLocalEntry {
  return {
    scopeEntityId: null,
    resourceType: null,
    resourceId: null,
    sequence: 1n,
    active: true,
    blocksIngest: true,
    blocksRead: true,
    blocksQueueEnqueue: true,
    trigger: 'REVOKED',
    activatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('deny-switch evaluator', () => {
  it('denies ingest immediately for organization scope', () => {
    const store = new DenySwitchLocalStore();
    store.apply(
      entry({
        organizationId: 'org-1',
        scopeType: DENY_SWITCH_SCOPE.ORGANIZATION,
        sequence: 5n,
      }),
    );
    store.markReady();

    const result = evaluateDenySwitchLocal(
      {
        organizationId: 'org-1',
        action: AUTHORIZATION_DECISION_ACTION.INGEST,
      },
      store.allActive(),
      store.isReady(),
      true,
    );

    expect(result?.denied).toBe(true);
    expect(result?.reasonCode).toBe(DENY_SWITCH_REASON.DENY_SWITCH_ORG);
  });

  it('denies resource-scoped vehicle read', () => {
    const store = new DenySwitchLocalStore();
    store.apply(
      entry({
        organizationId: 'org-1',
        scopeType: DENY_SWITCH_SCOPE.RESOURCE,
        resourceType: 'VEHICLE',
        resourceId: 'veh-1',
        blocksIngest: false,
        blocksRead: true,
      }),
    );
    store.markReady();

    const denied = evaluateDenySwitchLocal(
      {
        organizationId: 'org-1',
        action: AUTHORIZATION_DECISION_ACTION.READ,
        vehicleId: 'veh-1',
      },
      store.allActive(),
      store.isReady(),
      true,
    );
    expect(denied?.denied).toBe(true);

    const allowed = evaluateDenySwitchLocal(
      {
        organizationId: 'org-1',
        action: AUTHORIZATION_DECISION_ACTION.READ,
        vehicleId: 'veh-2',
      },
      store.allActive(),
      store.isReady(),
      true,
    );
    expect(allowed).toBeNull();
  });

  it('fail-closed when store not ready after grace', () => {
    const result = evaluateDenySwitchLocal(
      {
        organizationId: 'org-1',
        action: AUTHORIZATION_DECISION_ACTION.INGEST,
      },
      [],
      false,
      true,
    );
    expect(result?.denied).toBe(true);
    expect(result?.reasonCode).toBe(DENY_SWITCH_REASON.DENY_SWITCH_NOT_READY);
  });

  it('ignores stale propagation events with lower sequence', () => {
    const store = new DenySwitchLocalStore();
    store.apply(
      entry({
        organizationId: 'org-1',
        scopeType: DENY_SWITCH_SCOPE.PROCESSING_ACTIVITY,
        scopeEntityId: 'pa-1',
        sequence: 10n,
      }),
    );
    const stale = entry({
      organizationId: 'org-1',
      scopeType: DENY_SWITCH_SCOPE.PROCESSING_ACTIVITY,
      scopeEntityId: 'pa-1',
      sequence: 5n,
      active: false,
    });
    expect(store.apply(stale, { allowDeactivate: true })).toBe(false);
    expect(store.get('org-1:PROCESSING_ACTIVITY:pa-1::')?.sequence).toBe(10n);
  });

  it('blocks queue enqueue for org scope', () => {
    const store = new DenySwitchLocalStore();
    store.apply(
      entry({
        organizationId: 'org-1',
        scopeType: DENY_SWITCH_SCOPE.ORGANIZATION,
      }),
    );
    store.markReady();
    expect(
      isQueueEnqueueDeniedLocal('org-1', store.allActive(), store.isReady(), true),
    ).toBe(true);
  });
});

describe('DenySwitchLocalStore', () => {
  it('hydrates from database rows on restart', () => {
    const store = new DenySwitchLocalStore();
    const row = rowToLocalEntry({
      organizationId: 'org-1',
      scopeType: DENY_SWITCH_SCOPE.ENFORCEMENT_POLICY,
      scopeEntityId: 'ep-1',
      resourceType: null,
      resourceId: null,
      sequence: 3n,
      active: true,
      blocksIngest: true,
      blocksRead: true,
      blocksQueueEnqueue: true,
      trigger: 'REVOKED',
      activatedAt: new Date(),
    });
    store.apply(row);
    store.markReady();
    expect(store.size()).toBe(1);
    expect(store.listForOrganization('org-1')).toHaveLength(1);
  });
});
