import { api, type ApiServiceCase } from '../../../lib/api';

/**
 * Service Center list load — org-scoped `serviceCases.list` only.
 * Uses the list endpoint (not per-case GET) and does not fetch document bodies.
 */
export async function fetchServiceCenterServiceCases(orgId: string): Promise<ApiServiceCase[]> {
  const response = await api.serviceCases.list(orgId);
  if (!Array.isArray(response)) {
    throw new Error('Invalid service cases list response');
  }
  return response;
}

export function hasServiceCenterServiceCases(cases: ApiServiceCase[]): boolean {
  return cases.length > 0;
}
