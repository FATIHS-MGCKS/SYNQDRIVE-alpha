export interface StationSummariesRequestParams {
  page?: number;
  pageSize?: number;
  status?: string;
  type?: string;
  isPrimary?: boolean;
  search?: string;
  pickupCapabilityAvailable?: boolean;
  returnCapabilityAvailable?: boolean;
  hasConfigurationProblems?: boolean;
  at?: string;
}

export function buildStationSummariesRequestPath(
  orgId: string,
  params: StationSummariesRequestParams = {},
): string {
  const q = new URLSearchParams();
  if (params.page != null) q.set('page', String(params.page));
  if (params.pageSize != null) q.set('pageSize', String(params.pageSize));
  if (params.status) q.set('status', params.status);
  if (params.type) q.set('type', params.type);
  if (params.isPrimary != null) q.set('isPrimary', String(params.isPrimary));
  if (params.search) q.set('search', params.search);
  if (params.pickupCapabilityAvailable != null) {
    q.set('pickupCapabilityAvailable', String(params.pickupCapabilityAvailable));
  }
  if (params.returnCapabilityAvailable != null) {
    q.set('returnCapabilityAvailable', String(params.returnCapabilityAvailable));
  }
  if (params.hasConfigurationProblems != null) {
    q.set('hasConfigurationProblems', String(params.hasConfigurationProblems));
  }
  if (params.at) q.set('at', params.at);
  const qs = q.toString();
  return `/organizations/${orgId}/stations/summaries${qs ? `?${qs}` : ''}`;
}
