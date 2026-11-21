/**
 * Routes permitted for PENDING organizations (onboarding/setup only).
 * All other org-scoped tenant routes require ACTIVE.
 */
const PENDING_ONBOARDING_PATH_PATTERNS: Array<{ methods: string[]; pattern: RegExp }> = [
  {
    methods: ['GET', 'PATCH', 'POST'],
    pattern: /^\/api\/v1\/organizations\/[^/]+\/profile(?:\/|$)/,
  },
  {
    methods: ['GET', 'POST', 'DELETE'],
    pattern: /^\/api\/v1\/organizations\/[^/]+\/invites(?:\/|$)/,
  },
];

export function resolveTenantAccessSurfaceFromHttpRequest(request: {
  method?: string;
  url?: string;
  path?: string;
}): 'TENANT_OPERATIONAL' | 'TENANT_ONBOARDING' {
  const method = (request.method ?? 'GET').toUpperCase();
  const path = (request.url ?? request.path ?? '').split('?')[0];

  for (const entry of PENDING_ONBOARDING_PATH_PATTERNS) {
    if (entry.methods.includes(method) && entry.pattern.test(path)) {
      return 'TENANT_ONBOARDING';
    }
  }

  return 'TENANT_OPERATIONAL';
}