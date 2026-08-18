import { MASTER_ADMIN_SMOKE_EMAIL } from './master-admin-smoke-lifecycle.constants';

export interface MasterAdminSmokeReadonlyCheck {
  id: string;
  workflow: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  method: 'GET';
  path: string;
}

export const MASTER_ADMIN_SMOKE_READONLY_CHECKS: MasterAdminSmokeReadonlyCheck[] = [
  { id: 'A-dashboard', workflow: 'A', method: 'GET', path: '/api/v1/admin/dashboard/operational' },
  { id: 'A-organizations', workflow: 'A', method: 'GET', path: '/api/v1/admin/organizations' },
  { id: 'B-billing-overview', workflow: 'B', method: 'GET', path: '/api/v1/admin/billing/overview/operational' },
  { id: 'C-vehicles-overview', workflow: 'C', method: 'GET', path: '/api/v1/admin/vehicles/operational/overview' },
  { id: 'C-connectivity', workflow: 'C', method: 'GET', path: '/api/v1/admin/connectivity/platform-summary' },
  { id: 'D-ops-overview', workflow: 'D', method: 'GET', path: '/api/v1/admin/ops/overview' },
  { id: 'D-ops-incidents', workflow: 'D', method: 'GET', path: '/api/v1/admin/ops/incidents' },
  { id: 'E-security-attention', workflow: 'E', method: 'GET', path: '/api/v1/admin/security/attention-summary' },
  { id: 'E-security-users', workflow: 'E', method: 'GET', path: '/api/v1/admin/security/users' },
  { id: 'F-integrations', workflow: 'F', method: 'GET', path: '/api/v1/admin/platform-integrations/overview' },
];

export interface MasterAdminSmokeLoginResult {
  ok: boolean;
  status: number;
  accessTokenPresent: boolean;
  error?: string;
}

export interface MasterAdminSmokeReadonlyResult {
  id: string;
  workflow: string;
  path: string;
  status: number;
  ok: boolean;
}

export interface MasterAdminSmokeRunSummary {
  baseUrl: string;
  email: string;
  login: MasterAdminSmokeLoginResult;
  checks: MasterAdminSmokeReadonlyResult[];
  passed: number;
  failed: number;
}

function resolveSmokeBaseUrl(): string {
  return (process.env.MASTER_ADMIN_SMOKE_BASE_URL || 'https://app.synqdrive.eu').replace(/\/$/, '');
}

export async function loginMasterAdminSmokeAccount(input: {
  password: string;
  baseUrl?: string;
}): Promise<{ accessToken: string; login: MasterAdminSmokeLoginResult }> {
  const baseUrl = (input.baseUrl || resolveSmokeBaseUrl()).replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      email: MASTER_ADMIN_SMOKE_EMAIL,
      password: input.password,
    }),
  });

  const login: MasterAdminSmokeLoginResult = {
    ok: response.ok,
    status: response.status,
    accessTokenPresent: false,
  };

  if (!response.ok) {
    login.error = `login_failed_${response.status}`;
    return { accessToken: '', login };
  }

  const payload = (await response.json()) as { accessToken?: string; token?: string };
  const accessToken = payload.accessToken || payload.token || '';
  login.accessTokenPresent = Boolean(accessToken);
  if (!accessToken) {
    login.ok = false;
    login.error = 'missing_access_token';
  }
  return { accessToken, login };
}

export async function runMasterAdminReadonlySmoke(input: {
  password: string;
  baseUrl?: string;
}): Promise<MasterAdminSmokeRunSummary> {
  const baseUrl = (input.baseUrl || resolveSmokeBaseUrl()).replace(/\/$/, '');
  const { accessToken, login } = await loginMasterAdminSmokeAccount(input);

  const checks: MasterAdminSmokeReadonlyResult[] = [];
  if (!login.ok || !accessToken) {
    return {
      baseUrl,
      email: MASTER_ADMIN_SMOKE_EMAIL,
      login,
      checks,
      passed: 0,
      failed: MASTER_ADMIN_SMOKE_READONLY_CHECKS.length,
    };
  }

  for (const check of MASTER_ADMIN_SMOKE_READONLY_CHECKS) {
    const response = await fetch(`${baseUrl}${check.path}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
    });
    const ok = response.status >= 200 && response.status < 300;
    checks.push({
      id: check.id,
      workflow: check.workflow,
      path: check.path,
      status: response.status,
      ok,
    });
  }

  const passed = checks.filter((row) => row.ok).length;
  return {
    baseUrl,
    email: MASTER_ADMIN_SMOKE_EMAIL,
    login,
    checks,
    passed,
    failed: checks.length - passed,
  };
}
