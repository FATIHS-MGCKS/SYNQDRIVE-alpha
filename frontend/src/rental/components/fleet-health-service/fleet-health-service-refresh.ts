export type FleetHealthServiceRefreshSource =
  | 'rentalHealth'
  | 'fleetRuntime'
  | 'taskSummary'
  | 'tasks'
  | 'vendors'
  | 'serviceCases';

export interface FleetHealthServiceRefreshSourceResult {
  source: FleetHealthServiceRefreshSource;
  status: 'fulfilled' | 'rejected';
  error: string | null;
}

export interface FleetHealthServiceRefreshResult {
  results: FleetHealthServiceRefreshSourceResult[];
  partial: boolean;
  allSucceeded: boolean;
}

export interface FleetHealthServiceRefreshHandlers {
  rentalHealth: () => Promise<void>;
  fleetRuntime: () => Promise<void>;
  taskSummary: () => Promise<void>;
  tasks: () => Promise<void>;
  vendors: () => Promise<void>;
  serviceCases: () => Promise<void>;
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

export async function executeFleetHealthServiceRefresh(
  handlers: FleetHealthServiceRefreshHandlers,
): Promise<FleetHealthServiceRefreshResult> {
  const entries: Array<[FleetHealthServiceRefreshSource, () => Promise<void>]> = [
    ['rentalHealth', handlers.rentalHealth],
    ['fleetRuntime', handlers.fleetRuntime],
    ['taskSummary', handlers.taskSummary],
    ['tasks', handlers.tasks],
    ['vendors', handlers.vendors],
    ['serviceCases', handlers.serviceCases],
  ];

  const settled = await Promise.allSettled(entries.map(([, reload]) => reload()));

  const results: FleetHealthServiceRefreshSourceResult[] = settled.map((result, index) => ({
    source: entries[index][0],
    status: result.status === 'fulfilled' ? 'fulfilled' : 'rejected',
    error: result.status === 'rejected' ? errorMessage(result.reason) : null,
  }));

  const allSucceeded = results.every((entry) => entry.status === 'fulfilled');
  const partial = !allSucceeded && results.some((entry) => entry.status === 'fulfilled');

  return { results, partial, allSucceeded };
}
