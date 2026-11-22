/**
 * MOCK_EVIDENCE — Master Admin Connected Vehicles DIMO permissions drawer (P6D4).
 * API/DIMO Identity not exercised; hook responses are fixtures only.
 * Does not prove live DIMO or production provider behavior.
 */
// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { ConnectedVehicleDimoPermissionsSection } from './ConnectedVehicleDimoPermissionsSection';
import type { OrganizationDimoPrivilegeStatusDto, OrganizationDimoPrivilegeVehicleRow } from './dimo-privilege.types';

type HookReturn = ReturnType<
  typeof import('./useConnectedVehicleDimoPrivilege').useConnectedVehicleDimoPrivilege
>;

function buildVehicleRow(overrides: Partial<OrganizationDimoPrivilegeVehicleRow>): OrganizationDimoPrivilegeVehicleRow {
  return {
    vehicleId: 'veh-1',
    tokenId: 42,
    localConnectionStatus: 'CONNECTED',
    consentStatus: 'ACTIVE',
    stillPrivileged: null,
    verificationStatus: 'UNVERIFIED',
    ...overrides,
  };
}

function buildStatus(overrides: Partial<OrganizationDimoPrivilegeStatusDto>): OrganizationDimoPrivilegeStatusDto {
  return {
    organizationId: 'org-1',
    jobId: 'job-1',
    jobStatus: 'PREPARED',
    phase: 'EXECUTION',
    lastVerifiedAt: '2026-11-22T12:00:00.000Z',
    providerCheckStatus: 'NOT_VERIFIED',
    finalizationState: null,
    detailCode: null,
    vehicles: [buildVehicleRow({})],
    ...overrides,
  };
}

const defaultHook: HookReturn = {
  status: null,
  vehicleRow: null,
  loading: false,
  loadError: null,
  refresh: vi.fn(),
  recheckLoading: false,
  recheckError: null,
  recheckResult: null,
  runRecheck: vi.fn(),
  handoffLoading: false,
  handoffError: null,
  handoffResult: null,
  runHandoff: vi.fn(),
  prepareHandoffIdempotency: vi.fn(),
  mfaRequired: false,
  retryAfterMfa: vi.fn(),
  dismissMfa: vi.fn(),
};

let hookState: HookReturn = { ...defaultHook };

vi.mock('./useConnectedVehicleDimoPrivilege', () => ({
  useConnectedVehicleDimoPrivilege: () => hookState,
}));

vi.mock('../../components/mfa/MfaStepUpDialog', () => ({
  MfaStepUpDialog: (props: { open: boolean; action: string }) =>
    props.open ? createElement('div', { 'data-testid': 'mfa-step-up', 'data-action': props.action }) : null,
}));

function renderSection(extra?: { enabled?: boolean; organizationId?: string; vehicleId?: string }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const props = {
    organizationId: extra?.organizationId ?? 'org-1',
    vehicleId: extra?.vehicleId ?? 'veh-1',
    enabled: extra?.enabled ?? true,
    tokenIdMasked: '…12',
    dimoConnectivityLabel: 'Fleet access',
  };
  return {
    container,
    root,
    render: async (children?: ReactNode) => {
      await act(async () => {
        root.render(
          createElement(LanguageProvider, {
            children: children ?? createElement(ConnectedVehicleDimoPermissionsSection, props),
          }),
        );
      });
    },
    unmount: () => {
      root.unmount();
      container.remove();
    },
  };
}

describe('ConnectedVehicleDimoPermissionsSection — mock drawer E2E (MOCK_EVIDENCE)', () => {
  let roots: Root[] = [];

  beforeEach(() => {
    hookState = { ...defaultHook, refresh: vi.fn(), runRecheck: vi.fn(), runHandoff: vi.fn() };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    roots = [];
  });

  it('renders loading status with aria-busy', async () => {
    hookState = { ...hookState, loading: true };
    const ui = renderSection();
    await ui.render();
    const section = document.body.querySelector('section[aria-busy="true"]');
    expect(section).toBeTruthy();
    expect(document.body.textContent).toMatch(/loading/i);
    ui.unmount();
  });

  it('renders load error and exposes retry', async () => {
    hookState = { ...hookState, loadError: 'network' };
    const ui = renderSection();
    await ui.render();
    expect(document.body.querySelector('[role="alert"]')).toBeTruthy();
    expect(document.body.textContent).toMatch(/try again/i);
    ui.unmount();
  });

  it('renders nothing without active offboarding job (no jobId)', async () => {
    hookState = {
      ...hookState,
      status: buildStatus({ jobId: null, jobStatus: null }),
      vehicleRow: buildVehicleRow({}),
    };
    const ui = renderSection();
    await ui.render();
    expect(document.body.querySelector('section')).toBeNull();
    ui.unmount();
  });

  it('shows privilege still active disposition', async () => {
    hookState = {
      ...hookState,
      status: buildStatus({ providerCheckStatus: 'PRIVILEGE_STILL_ACTIVE' }),
      vehicleRow: buildVehicleRow({
        stillPrivileged: true,
        verificationStatus: 'VERIFIED_STILL_PRIVILEGED',
      }),
    };
    const ui = renderSection();
    await ui.render();
    expect(document.body.textContent).toMatch(/Privileged access still active/i);
    expect(document.body.textContent).toMatch(/owner/i);
    ui.unmount();
  });

  it('shows privilege verified absent disposition', async () => {
    hookState = {
      ...hookState,
      status: buildStatus({ providerCheckStatus: 'CONFIRMED_ABSENT' }),
      vehicleRow: buildVehicleRow({
        stillPrivileged: false,
        verificationStatus: 'VERIFIED_ABSENT',
      }),
    };
    const ui = renderSection();
    await ui.render();
    expect(document.body.textContent).toMatch(/No privileged access detected/i);
    expect(document.body.textContent).toMatch(/No outstanding owner action indicated/i);
    ui.unmount();
  });

  it('shows unverified state without treating as cleared', async () => {
    hookState = {
      ...hookState,
      status: buildStatus({ providerCheckStatus: 'NOT_VERIFIED' }),
      vehicleRow: buildVehicleRow({ stillPrivileged: null, verificationStatus: 'UNVERIFIED' }),
    };
    const ui = renderSection();
    await ui.render();
    expect(document.body.textContent).toMatch(/Unverified/i);
    expect(document.body.textContent).not.toMatch(/No further owner action expected/i);
    ui.unmount();
  });

  it('shows provider NOT_AVAILABLE with fail-closed hint (not revoked)', async () => {
    hookState = {
      ...hookState,
      status: buildStatus({ providerCheckStatus: 'NOT_AVAILABLE', detailCode: 'DIMO_EXTERNAL_VERIFY_FAILED' }),
      vehicleRow: buildVehicleRow({}),
    };
    const ui = renderSection();
    await ui.render();
    expect(document.body.textContent).toMatch(/Verification unavailable/i);
    expect(document.body.textContent).toMatch(/does not mean privilege was revoked/i);
    ui.unmount();
  });

  it('shows recheck feature gate OFF copy', async () => {
    hookState = {
      ...hookState,
      status: buildStatus({ detailCode: 'DIMO_PRIVILEGE_RECHECK_NOT_ARMED' }),
      vehicleRow: buildVehicleRow({ stillPrivileged: true, verificationStatus: 'VERIFIED_STILL_PRIVILEGED' }),
    };
    const ui = renderSection();
    await ui.render();
    expect(document.body.textContent).toMatch(/recheck/i);
    expect(document.body.textContent).toMatch(/not armed|disabled|gate/i);
    ui.unmount();
  });

  it('opens MFA step-up with MASTER_ORGANIZATION when required', async () => {
    hookState = {
      ...hookState,
      status: buildStatus({}),
      vehicleRow: buildVehicleRow({ stillPrivileged: true, verificationStatus: 'VERIFIED_STILL_PRIVILEGED' }),
      mfaRequired: true,
    };
    const ui = renderSection();
    await ui.render();
    const mfa = document.body.querySelector('[data-testid="mfa-step-up"]');
    expect(mfa).toBeTruthy();
    expect(mfa?.getAttribute('data-action')).toBe('MASTER_ORGANIZATION');
    ui.unmount();
  });

  it('records handoff only after confirm; states internal-only disclaimer', async () => {
    const runHandoff = vi.fn();
    hookState = {
      ...hookState,
      status: buildStatus({}),
      vehicleRow: buildVehicleRow({ stillPrivileged: true, verificationStatus: 'VERIFIED_STILL_PRIVILEGED' }),
      runHandoff,
    };
    const ui = renderSection();
    await ui.render();
    expect(document.body.textContent).toMatch(/not proof of delivery to the vehicle owner/i);

    const handoffBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      /record owner handoff/i.test(b.textContent ?? ''),
    );
    expect(handoffBtn).toBeTruthy();
    await act(async () => {
      handoffBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      /record handoff/i.test(b.textContent ?? '') && !/record owner handoff/i.test(b.textContent ?? ''),
    );
    expect(confirmBtn).toBeTruthy();
    await act(async () => {
      confirmBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(runHandoff).toHaveBeenCalledTimes(1);
    ui.unmount();
  });

  it('shows idempotent replay message without implying external delivery', async () => {
    hookState = {
      ...hookState,
      status: buildStatus({}),
      vehicleRow: buildVehicleRow({ stillPrivileged: false, verificationStatus: 'VERIFIED_ABSENT' }),
      handoffResult: {
        handoff: {
          handoffId: 'h1',
          requestedAt: '2026-11-22T12:00:00.000Z',
          status: 'RECORDED',
          idempotencyKey: 'k1',
        },
        idempotentReplay: true,
        handoffsRecorded: 0,
      },
    };
    const ui = renderSection();
    await ui.render();
    expect(document.body.textContent).toMatch(/Idempotent replay/i);
    expect(document.body.textContent).not.toMatch(/delivered to owner/i);
    ui.unmount();
  });

  it('disables vehicle mutations when vehicle not in inventory snapshot', async () => {
    hookState = {
      ...hookState,
      status: buildStatus({ vehicles: [] }),
      vehicleRow: null,
    };
    const ui = renderSection();
    await ui.render();
    expect(document.body.textContent).toMatch(/not in the DIMO inventory/i);
    const buttons = Array.from(document.body.querySelectorAll('button'));
    const recheck = buttons.find((b) => /recheck/i.test(b.textContent ?? ''));
    expect(recheck?.hasAttribute('disabled')).toBe(true);
    ui.unmount();
  });

  it('exposes accessible section label', async () => {
    hookState = {
      ...hookState,
      status: buildStatus({}),
      vehicleRow: buildVehicleRow({}),
    };
    const ui = renderSection();
    await ui.render();
    const section = document.body.querySelector('section[aria-label]');
    expect(section?.getAttribute('aria-label')).toMatch(/DIMO/i);
    expect(document.body.querySelector('.sm\\:grid-cols-2')).toBeTruthy();
    ui.unmount();
  });

  it('invokes recheck without extra provider calls beyond hook (mock boundary)', async () => {
    const runRecheck = vi.fn();
    hookState = {
      ...hookState,
      status: buildStatus({}),
      vehicleRow: buildVehicleRow({ stillPrivileged: true, verificationStatus: 'VERIFIED_STILL_PRIVILEGED' }),
      runRecheck,
    };
    const ui = renderSection();
    await ui.render();
    const recheckBtn = Array.from(document.body.querySelectorAll('button')).find((b) =>
      /recheck/i.test(b.textContent ?? ''),
    );
    await act(async () => {
      recheckBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(runRecheck).toHaveBeenCalledTimes(1);
    ui.unmount();
  });
});