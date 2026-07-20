export type ServiceCenterSourceStatus = 'idle' | 'loading' | 'ready' | 'error' | 'stale';

export interface ServiceCenterSourceState<T> {
  data: T;
  status: ServiceCenterSourceStatus;
  error: string | null;
  fetchedAt: string | null;
}

export interface ServiceCenterSource<T> extends ServiceCenterSourceState<T> {
  reload: () => Promise<void>;
}

export const TASK_SUMMARY_ERROR_MESSAGE = 'Aufgaben-Kennzahlen konnten nicht geladen werden.';
export const TASKS_ERROR_MESSAGE = 'Aufgaben konnten nicht geladen werden.';
export const VENDOR_SOURCE_ERROR_MESSAGE = 'Partnerdaten konnten nicht geladen werden.';
export const SERVICE_CASES_ERROR_MESSAGE = 'Servicefälle konnten nicht geladen werden.';

export function normalizeArrayResponse<T>(response: unknown): T[] {
  return Array.isArray(response) ? response : [];
}

export function resolveSourceAfterSuccess<T>(
  data: T,
  fetchedAt: string,
): ServiceCenterSourceState<T> & { status: 'ready' } {
  return {
    data,
    status: 'ready',
    fetchedAt,
    error: null,
  };
}

export function resolveSourceAfterError<T>(input: {
  previousData: T;
  previousStatus: ServiceCenterSourceStatus;
  previousFetchedAt: string | null;
  emptyData: T;
  hasMeaningfulData: (data: T) => boolean;
  errorMessage: string;
}): ServiceCenterSourceState<T> & { status: 'error' | 'stale' } {
  const hadPriorData =
    input.previousStatus === 'ready' ||
    input.previousStatus === 'stale' ||
    input.hasMeaningfulData(input.previousData);

  if (hadPriorData) {
    return {
      data: input.previousData,
      status: 'stale',
      fetchedAt: input.previousFetchedAt,
      error: input.errorMessage,
    };
  }

  return {
    data: input.emptyData,
    status: 'error',
    fetchedAt: null,
    error: input.errorMessage,
  };
}

export function isSourceSettled(status: ServiceCenterSourceStatus): boolean {
  return status === 'ready' || status === 'stale' || status === 'error';
}

export function isSourceUsable(status: ServiceCenterSourceStatus): boolean {
  return status === 'ready' || status === 'stale';
}

export function hasPartialServiceCenterData(
  statuses: ServiceCenterSourceStatus[],
): boolean {
  const settled = statuses.filter(isSourceSettled);
  if (settled.length === 0) return false;
  const usable = settled.filter(isSourceUsable);
  return usable.length > 0 && usable.length < settled.length;
}
