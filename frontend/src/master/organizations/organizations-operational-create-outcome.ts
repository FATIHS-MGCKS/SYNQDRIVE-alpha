export type CreateOrgRefreshOutcome = 'complete' | 'partial';

export function classifyCreateOrgRefreshOutcome(refreshError: string | null): CreateOrgRefreshOutcome {
  return refreshError ? 'partial' : 'complete';
}