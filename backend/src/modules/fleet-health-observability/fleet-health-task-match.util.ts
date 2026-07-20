const OPEN_TASK_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'WAITING', 'ACTIVE']);

export type HealthTaskLegacyMatchOutcome =
  | 'module_exact'
  | 'legacy_blocking'
  | 'legacy_health_metadata'
  | 'legacy_type'
  | 'ambiguous'
  | 'none';

export interface FleetHealthTaskMatchInput {
  vehicleId: string | null;
  status: string;
  type: string;
  sourceType: string | null;
  source: string | null;
  blocksVehicleAvailability: boolean;
  metadata: unknown;
}

function taskMetadata(task: FleetHealthTaskMatchInput): Record<string, unknown> | null {
  if (!task.metadata || typeof task.metadata !== 'object') return null;
  return task.metadata as Record<string, unknown>;
}

function isOpenTask(task: FleetHealthTaskMatchInput): boolean {
  return OPEN_TASK_STATUSES.has(task.status);
}

function legacyMatchKinds(
  task: FleetHealthTaskMatchInput,
  primaryModule: string | null,
): HealthTaskLegacyMatchOutcome[] {
  if (!isOpenTask(task)) return [];
  const kinds: HealthTaskLegacyMatchOutcome[] = [];
  const meta = taskMetadata(task);
  const healthModule = typeof meta?.healthModule === 'string' ? meta.healthModule : null;

  if (primaryModule && healthModule === primaryModule) {
    kinds.push('module_exact');
  }
  if (task.blocksVehicleAvailability) {
    kinds.push('legacy_blocking');
  }
  if (task.sourceType === 'HEALTH' && healthModule) {
    kinds.push('legacy_health_metadata');
  }
  if (task.sourceType === 'HEALTH' || task.source?.startsWith('INSIGHT_')) {
    kinds.push('legacy_type');
  }
  return kinds;
}

/**
 * Classifies health→task legacy matching for one vehicle.
 * Returns `ambiguous` when multiple distinct legacy match paths apply.
 */
export function classifyHealthTaskLegacyMatch(
  tasks: FleetHealthTaskMatchInput[],
  vehicleId: string,
  primaryModule: string | null,
  rentalBlocked: boolean,
): HealthTaskLegacyMatchOutcome {
  const vehicleTasks = tasks.filter((task) => task.vehicleId === vehicleId && isOpenTask(task));
  const kinds = new Set<HealthTaskLegacyMatchOutcome>();

  for (const task of vehicleTasks) {
    const meta = taskMetadata(task);
    const healthModule = typeof meta?.healthModule === 'string' ? meta.healthModule : null;

    if (primaryModule && healthModule === primaryModule) {
      kinds.add('module_exact');
      continue;
    }
    if (task.blocksVehicleAvailability) {
      kinds.add('legacy_blocking');
      continue;
    }
    if (task.sourceType === 'HEALTH' && healthModule) {
      kinds.add('legacy_health_metadata');
      continue;
    }
    if (task.sourceType === 'HEALTH' || task.source?.startsWith('INSIGHT_')) {
      kinds.add('legacy_type');
    }
  }

  if (kinds.size > 1) return 'ambiguous';
  if (kinds.size === 1) return [...kinds][0]!;

  if (rentalBlocked) {
    const blockingTasks = vehicleTasks.filter((task) => task.blocksVehicleAvailability);
    if (blockingTasks.length > 1) return 'ambiguous';
    if (blockingTasks.length === 1) return 'legacy_blocking';
  }

  return 'none';
}

/** Count vehicles with ambiguous legacy health→task matches across a task list. */
export function countAmbiguousHealthTaskLegacyMatches(
  tasks: FleetHealthTaskMatchInput[],
): number {
  const byVehicle = new Map<string, FleetHealthTaskMatchInput[]>();
  for (const task of tasks) {
    if (!task.vehicleId || !isOpenTask(task)) continue;
    const list = byVehicle.get(task.vehicleId) ?? [];
    list.push(task);
    byVehicle.set(task.vehicleId, list);
  }

  let ambiguous = 0;
  for (const [vehicleId, vehicleTasks] of byVehicle) {
    const healthModules = new Set<string>();
    let legacyCandidates = 0;

    for (const task of vehicleTasks) {
      const meta = taskMetadata(task);
      const module = typeof meta?.healthModule === 'string' ? meta.healthModule : null;
      if (module) healthModules.add(module);
      const kinds = legacyMatchKinds(task, module);
      if (kinds.length > 0) legacyCandidates += 1;
    }

    const outcome = classifyHealthTaskLegacyMatch(vehicleTasks, vehicleId, null, false);
    if (outcome === 'ambiguous' || healthModules.size > 1 || legacyCandidates > 1) {
      ambiguous += 1;
    }
  }

  return ambiguous;
}
