import type { Page } from '@playwright/test';
import { installSecurityAccessMocks } from './security-access-fixtures';

type CreateAttempt = { headers: Record<string, string>; body: Record<string, unknown> };
type PatchAttempt = { headers: Record<string, string>; body: Record<string, unknown> };

import { SA_FIXTURE_USER_A } from './security-access-fixtures';

const PROFILE_USER_ID = SA_FIXTURE_USER_A.id;

const createAttempts: CreateAttempt[] = [];
const patchAttempts: PatchAttempt[] = [];
let requireStepUpUntilChallenge = false;
let requireProfileStepUpUntilChallenge = false;
let stepUpSatisfied = false;
let failNextCreateOnce = false;

export function resetP3a3cFixtureState() {
  createAttempts.length = 0;
  patchAttempts.length = 0;
  requireStepUpUntilChallenge = false;
  requireProfileStepUpUntilChallenge = false;
  stepUpSatisfied = false;
  failNextCreateOnce = false;
}

export function getRecordedCreateAttempts() {
  return [...createAttempts];
}

export function getRecordedPatchAttempts() {
  return [...patchAttempts];
}

function fulfillCreate(route: import('@playwright/test').Route, body: Record<string, unknown>) {
  const invite = Boolean(
    (body.initialMembership as { inviteByEmail?: boolean } | undefined)?.inviteByEmail,
  );
  const credential = Boolean(body.sendCredentialSetup);
  return route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({
      user: {
        id: '00000000-0000-4000-8000-0000000000c3',
        email: body.email ?? 'new@fixture.test',
        name: [body.firstName, body.lastName].filter(Boolean).join(' ') || null,
        firstName: body.firstName ?? null,
        lastName: body.lastName ?? null,
        status: 'ACTIVE',
        platformRole: 'USER',
      },
      onboarding: {
        identityCreated: true,
        invitationPersisted: invite,
        deliveryRequested: invite || credential,
        deliveryConfirmed: false,
        accountReadyForAuthentication: credential,
      },
      membership: body.initialMembership
        ? { status: credential ? 'ACTIVE' : 'INVITED' }
        : null,
    }),
  });
}

export async function installSecurityAccessP3a3cMocks(page: Page) {
  resetP3a3cFixtureState();
  await installSecurityAccessMocks(page);

  await page.route('**/api/v1/account/mfa/challenge', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    stepUpSatisfied = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        stepUpToken: 'fixture-step-up-grant',
        stepUpExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    });
  });

  await page.route('**/api/v1/admin/security/users/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes(`/admin/security/users/${PROFILE_USER_ID}`) && method === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const headers = route.request().headers();
      patchAttempts.push({ headers, body });
      if (requireProfileStepUpUntilChallenge && !stepUpSatisfied && !headers['x-step-up-token']) {
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'STEP_UP_REQUIRED',
            message: '[STEP_UP_REQUIRED] MFA confirmation required',
            action: 'MASTER_USER_MANAGEMENT',
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: PROFILE_USER_ID, email: 'stepup@fixture.test', name: 'Step Patched' },
          globalProfile: { firstName: body.firstName ?? 'Step', lastName: body.lastName ?? null },
        }),
      });
    }
    return route.fallback();
  });

  await page.route('**/api/v1/admin/security/users', async (route) => {
    const url = route.request().url();
    if (!url.match(/\/admin\/security\/users\/?(\?.*)?$/) || route.request().method() !== 'POST') {
      return route.fallback();
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const headers = route.request().headers();
    createAttempts.push({ headers, body });
    if (failNextCreateOnce) {
      failNextCreateOnce = false;
      return route.fulfill({ status: 503, body: 'transient' });
    }
    if (requireStepUpUntilChallenge && !stepUpSatisfied && !headers['x-step-up-token']) {
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'STEP_UP_REQUIRED',
          message: '[STEP_UP_REQUIRED] MFA confirmation required',
          action: 'MASTER_USER_MANAGEMENT',
        }),
      });
    }
    return fulfillCreate(route, body);
  });
}

export function armCreateStepUpChallenge() {
  requireStepUpUntilChallenge = true;
  requireProfileStepUpUntilChallenge = false;
  stepUpSatisfied = false;
}

export function armProfileStepUpChallenge() {
  requireProfileStepUpUntilChallenge = true;
  requireStepUpUntilChallenge = false;
  stepUpSatisfied = false;
}

export function armTransientCreateFailure() {
  failNextCreateOnce = true;
}

export { PROFILE_USER_ID };