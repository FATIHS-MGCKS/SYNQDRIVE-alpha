import { expect, test } from '@playwright/test';

import {
  DP_FLOW_FOREIGN_ORG_ID,
  DP_FLOW_ORG_ID,
  DP_FLOW_VEHICLE_ALLOWED,
  DP_FLOW_VEHICLE_DENIED,
  attachNetworkFailureLogging,
  dpFlowApiRequest,
  fillInternalProcessingWizard,
  getFlowActivities,
  getFlowAuditDecisions,
  isFlowSessionInvalidated,
  installDataProcessingFlowMocks,
  openActivityDetail,
  openDataProcessingHub,
  runActivityLifecycleAction,
  setFlowFlags,
  simulateAuthorizationCheck,
  submitWizardDraft,
  submitWizardForReview,
} from './data-processing-flow-fixtures';

test.describe('Data Processing — full lifecycle E2E (mocked API)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test.beforeEach(({ page }, testInfo) => {
    attachNetworkFailureLogging(page);
    test.skip(testInfo.project.name !== 'desktop-1280', 'Flow specs run on desktop-1280 only');
  });

  test('1–9 — Draft, legal basis, scope, review, approval, schedule, activate', async ({ page }) => {
    await installDataProcessingFlowMocks(page, { locale: 'de' });
    await openDataProcessingHub(page);

    await fillInternalProcessingWizard(page, 'PA.FLOW.LC');
    await submitWizardDraft(page);
    await page.reload({ waitUntil: 'load' });
    await openDataProcessingHub(page);

    let activity = getFlowActivities().find((a) => a.activityCode === 'PA.FLOW.LC');
    expect(activity?.status).toBe('DRAFT');
    expect(activity?.dataCategories).toContain('GPS_LOCATION');

    await page.getByRole('button', { name: /Neuer Vorgang|New procedure/i }).click();
    await page.keyboard.press('Escape');

    await fillInternalProcessingWizard(page, 'PA.FLOW.REV', { forReview: true });
    await submitWizardForReview(page);
    await page.reload({ waitUntil: 'load' });
    await openDataProcessingHub(page);

    activity = getFlowActivities().find((a) => a.activityCode === 'PA.FLOW.REV');
    expect(activity?.status).toBe('IN_REVIEW');

    const cycleId = activity!.activeReviewCycleId!;
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/review-workflow/cycles/${cycleId}/decisions`, {
      method: 'POST',
      data: { stepType: 'PRIVACY_REVIEW', outcome: 'APPROVED' },
    });
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/review-workflow/cycles/${cycleId}/decisions`, {
      method: 'POST',
      data: { stepType: 'SECURITY_REVIEW', outcome: 'APPROVED' },
    });

    await openActivityDetail(page, /PA\.FLOW\.REV/);
    await runActivityLifecycleAction(page, /Genehmigen|Approve/i);

    activity = getFlowActivities().find((a) => a.id === activity!.id);
    expect(activity?.status).toBe('APPROVED');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await runActivityLifecycleAction(page, /Aktivierung planen|Schedule activation/i, {
      scheduleDate: tomorrow.toISOString().slice(0, 16),
    });
    expect(getFlowActivities().find((a) => a.id === activity!.id)?.status).toBe('SCHEDULED');

    await runActivityLifecycleAction(page, /^Aktivieren$|^Activate$/i);
    expect(getFlowActivities().find((a) => a.id === activity!.id)?.status).toBe('ACTIVE');
  });

  test('10–11 — Allowed and denied data access (enforcement simulation)', async ({ page }) => {
    await installDataProcessingFlowMocks(page);
    await openDataProcessingHub(page);
    await fillInternalProcessingWizard(page, 'PA.FLOW.ACCESS', { forReview: true });
    await submitWizardForReview(page);

    const activity = getFlowActivities().find((a) => a.activityCode === 'PA.FLOW.ACCESS')!;
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${activity.id}/approve`, { method: 'POST' });
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${activity.id}/activate`, { method: 'POST' });

    const allowed = simulateAuthorizationCheck({ vehicleId: DP_FLOW_VEHICLE_ALLOWED });
    const denied = simulateAuthorizationCheck({ vehicleId: DP_FLOW_VEHICLE_DENIED });
    expect(allowed.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
  });

  test('12–13 — Provider grant link and provider conflict blocks processing', async ({ page }) => {
    await installDataProcessingFlowMocks(page);
    await openDataProcessingHub(page);
    await fillInternalProcessingWizard(page, 'PA.FLOW.PROVIDER', { forReview: true });
    await submitWizardForReview(page);
    const activity = getFlowActivities().find((a) => a.activityCode === 'PA.FLOW.PROVIDER')!;
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${activity.id}/approve`, { method: 'POST' });
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${activity.id}/activate`, { method: 'POST' });

    const grantRes = await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/provider-access-grants`, {
      method: 'POST',
      data: {
        provider: 'DIMO',
        processingActivityId: activity.id,
        vehicleId: DP_FLOW_VEHICLE_ALLOWED,
        grantedScopes: ['telemetry'],
      },
    });
    expect(grantRes.status).toBe(201);

    setFlowFlags({ providerConflict: true });
    const activate = simulateAuthorizationCheck({ vehicleId: DP_FLOW_VEHICLE_ALLOWED });
    expect(activate.allowed).toBe(false);
    expect(activate.reason).toBe('PROVIDER_CONFLICT');
  });

  test('14–15 — Consent grant and withdrawal', async ({ page }) => {
    await installDataProcessingFlowMocks(page);
    await openDataProcessingHub(page);
    await fillInternalProcessingWizard(page, 'PA.FLOW.CONSENT');
    await submitWizardDraft(page);
    const activity = getFlowActivities().find((a) => a.activityCode === 'PA.FLOW.CONSENT')!;

    const create = await dpFlowApiRequest(
      page,
      `/api/v1/organizations/${DP_FLOW_ORG_ID}/processing-activities/${activity.id}/data-subject-consents`,
      {
        method: 'POST',
        data: {
          dataSubjectReference: 'subject-e2e-flow',
          subjectType: 'CUSTOMER',
          purpose: 'LIVE_MAP',
          consentTextVersion: 'v1',
          privacyNoticeVersion: 'pn1',
        },
      },
    );
    expect(create.status).toBe(201);
    const consentId = (create.body as { id: string }).id;

    const grant = await dpFlowApiRequest(
      page,
      `/api/v1/organizations/${DP_FLOW_ORG_ID}/processing-activities/${activity.id}/data-subject-consents/${consentId}/grant`,
      { method: 'POST' },
    );
    expect(grant.status).toBe(200);
    expect((grant.body as { consentStatus: string }).consentStatus).toBe('GRANTED');

    const withdraw = await dpFlowApiRequest(
      page,
      `/api/v1/organizations/${DP_FLOW_ORG_ID}/processing-activities/${activity.id}/data-subject-consents/${consentId}/withdraw`,
      { method: 'POST', data: { reason: 'E2E withdrawal test with sufficient length.' } },
    );
    expect(withdraw.status).toBe(200);
    expect((withdraw.body as { consentStatus: string }).consentStatus).toBe('WITHDRAWN');
  });

  test('16–18 — Deny-switch, queue block, revocation workflow complete', async ({ page }) => {
    await installDataProcessingFlowMocks(page, { denySwitch: true });
    setFlowFlags({ queueBlocked: true });
    await openDataProcessingHub(page);

    const deny = simulateAuthorizationCheck({ vehicleId: DP_FLOW_VEHICLE_ALLOWED });
    expect(deny.allowed).toBe(false);

    await page.locator('#dp-section-tab-enforcement').click();
    await expect(page.getByText(/ENFORCEMENT_ERROR|Enforcement-Fehler/i).first()).toBeVisible();

    await installDataProcessingFlowMocks(page);
    await openDataProcessingHub(page);
    await fillInternalProcessingWizard(page, 'PA.FLOW.REVOKE', { forReview: true });
    await submitWizardForReview(page);
    const activity = getFlowActivities().find((a) => a.activityCode === 'PA.FLOW.REVOKE')!;
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${activity.id}/approve`, { method: 'POST' });
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${activity.id}/activate`, { method: 'POST' });
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${activity.id}/revoke`, {
      method: 'POST',
      data: { reason: 'E2E revocation test with sufficient justification text.' },
    });

    const revoked = getFlowActivities().find((a) => a.id === activity.id);
    expect(revoked?.status).toBe('REVOKED');
  });

  test('19 — KPI and filters match list state', async ({ page }) => {
    await installDataProcessingFlowMocks(page);
    await openDataProcessingHub(page);
    await fillInternalProcessingWizard(page, 'PA.FLOW.KPI', { forReview: true });
    await submitWizardForReview(page);

    await page.reload({ waitUntil: 'load' });
    await openDataProcessingHub(page);

    const kpiGroup = page.getByRole('group', { name: /KPI|Kennzahlen/i });
    await expect(kpiGroup).toBeVisible();
    await kpiGroup.getByRole('button', { name: /Reviews fällig|Reviews due/i }).click();
    await expect(page.getByRole('row', { name: /PA.FLOW.KPI/i })).toBeVisible();
  });

  test('20 — Foreign tenant receives no data', async ({ page }) => {
    await installDataProcessingFlowMocks(page);
    await openDataProcessingHub(page);
    const res = await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_FOREIGN_ORG_ID}/data-authorizations/processing-activity-register`);
    expect(res.status).toBe(403);
  });

  test('23 — Historical version remains unchanged after new activation', async ({ page }) => {
    await installDataProcessingFlowMocks(page);
    await openDataProcessingHub(page);
    await fillInternalProcessingWizard(page, 'PA.FLOW.V1', { forReview: true });
    await submitWizardForReview(page);
    const v1 = getFlowActivities().find((a) => a.activityCode === 'PA.FLOW.V1')!;
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${v1.id}/approve`, { method: 'POST' });
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${v1.id}/activate`, { method: 'POST' });

    const versionsRes = await dpFlowApiRequest(
      page,
      `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/processing-activity-register/${v1.id}/versions`,
    );
    expect(versionsRes.status).toBe(200);
    const versions = versionsRes.body as Array<{ versionNumber: number; status: string }>;
    expect(versions[0].versionNumber).toBe(1);
    expect(versions[0].status).toBe('ACTIVE');
  });

  test('24 — Enforcement coverage shows correct state', async ({ page }) => {
    await installDataProcessingFlowMocks(page);
    await openDataProcessingHub(page);
    await page.locator('#dp-section-tab-enforcement').click();
    const coverage = await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/coverage`);
    expect((coverage.body as { fullyProtected: boolean }).fullyProtected).toBe(true);
  });

  test('25 — Expired policy blocks access', async ({ page }) => {
    await installDataProcessingFlowMocks(page, { policyExpired: true });
    await openDataProcessingHub(page);
    await fillInternalProcessingWizard(page, 'PA.FLOW.EXPIRED', { forReview: true });
    await submitWizardForReview(page);
    const activity = getFlowActivities().find((a) => a.activityCode === 'PA.FLOW.EXPIRED')!;
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${activity.id}/approve`, { method: 'POST' });
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${activity.id}/activate`, { method: 'POST' });

    const result = simulateAuthorizationCheck({ vehicleId: DP_FLOW_VEHICLE_ALLOWED });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('POLICY_EXPIRED');
  });

  test('26 — Missing DPIA blocks activation', async ({ page }) => {
    await installDataProcessingFlowMocks(page, { dpiaBlocks: true });
    await openDataProcessingHub(page);
    await fillInternalProcessingWizard(page, 'PA.FLOW.DPIA', { forReview: true });
    await submitWizardForReview(page);
    const activity = getFlowActivities().find((a) => a.activityCode === 'PA.FLOW.DPIA')!;
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${activity.id}/approve`, { method: 'POST' });
    const activate = await dpFlowApiRequest(
      page,
      `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${activity.id}/activate`,
      { method: 'POST' },
    );
    expect(activate.status).toBe(422);
  });

  test('27 — Missing DPA blocks external sharing', async ({ page }) => {
    await installDataProcessingFlowMocks(page);
    setFlowFlags({ dpaMissingExternal: true });
    await openDataProcessingHub(page);
    const external = simulateAuthorizationCheck({
      vehicleId: DP_FLOW_VEHICLE_ALLOWED,
      externalSharing: true,
    });
    expect(external.allowed).toBe(false);
    expect(external.reason).toBe('DPA_MISSING');
    const dpaList = await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-processing-agreements`);
    expect((dpaList.body as unknown[]).length).toBe(0);
  });

  test('28 — AI/MCP access denied without matching policy', async ({ page }) => {
    await installDataProcessingFlowMocks(page);
    await openDataProcessingHub(page);
    await fillInternalProcessingWizard(page, 'PA.FLOW.AI', { forReview: true });
    await submitWizardForReview(page);
    const activity = getFlowActivities().find((a) => a.activityCode === 'PA.FLOW.AI')!;
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${activity.id}/approve`, { method: 'POST' });
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${activity.id}/activate`, { method: 'POST' });

    const result = simulateAuthorizationCheck({
      vehicleId: DP_FLOW_VEHICLE_ALLOWED,
      purpose: 'DOCUMENT_PROCESSING',
      dataCategory: 'HEALTH_SIGNALS',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('PURPOSE_MISMATCH');
  });

  test('29–30 — Revocation invalidates session; audit timeline shows events', async ({ page }) => {
    await installDataProcessingFlowMocks(page);
    await openDataProcessingHub(page);
    await fillInternalProcessingWizard(page, 'PA.FLOW.AUDIT', { forReview: true });
    await submitWizardForReview(page);
    const activity = getFlowActivities().find((a) => a.activityCode === 'PA.FLOW.AUDIT')!;
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${activity.id}/approve`, { method: 'POST' });
    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${activity.id}/activate`, { method: 'POST' });

    simulateAuthorizationCheck({ vehicleId: DP_FLOW_VEHICLE_ALLOWED });
    simulateAuthorizationCheck({ vehicleId: DP_FLOW_VEHICLE_DENIED });

    await dpFlowApiRequest(page, `/api/v1/organizations/${DP_FLOW_ORG_ID}/data-authorizations/policy-lifecycle/processing-activities/${activity.id}/revoke`, {
      method: 'POST',
      data: { reason: 'E2E revocation test with sufficient justification text.' },
    });
    expect(isFlowSessionInvalidated()).toBe(true);

    await page.locator('#dp-section-tab-audit').click();
    const audit = getFlowAuditDecisions();
    expect(audit.length).toBeGreaterThan(0);
    await expect(page.getByText(/ALLOW|DENY/i).first()).toBeVisible();
  });
});
