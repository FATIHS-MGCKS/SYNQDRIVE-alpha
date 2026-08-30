import type { Registry } from 'prom-client';
import { Counter, Gauge } from 'prom-client';

export interface SchedulerLeaderMetricsHandles {
  leaderStatus: Gauge<string>;
  acquireTotal: Counter<string>;
  renewTotal: Counter<string>;
  leaderChangesTotal: Counter<string>;
  skippedNotLeaderTotal: Counter<string>;
  tickTotal: Counter<string>;
}

export function registerSchedulerLeaderMetrics(
  registry: Registry,
): SchedulerLeaderMetricsHandles {
  const leaderStatus = new Gauge({
    name: 'synqdrive_scheduler_leader_status',
    help: 'Scheduler leader election role for this process (1=leader, 0=follower/unknown)',
    registers: [registry],
  });

  const acquireTotal = new Counter({
    name: 'synqdrive_scheduler_leader_acquire_total',
    help: 'Scheduler leader lease acquire attempts',
    labelNames: ['result'],
    registers: [registry],
  });

  const renewTotal = new Counter({
    name: 'synqdrive_scheduler_leader_renew_total',
    help: 'Scheduler leader lease renew attempts',
    labelNames: ['result'],
    registers: [registry],
  });

  const leaderChangesTotal = new Counter({
    name: 'synqdrive_scheduler_leader_changes_total',
    help: 'Scheduler leader role transitions',
    labelNames: ['to_role'],
    registers: [registry],
  });

  const skippedNotLeaderTotal = new Counter({
    name: 'synqdrive_scheduler_skipped_not_leader_total',
    help: 'Singleton scheduler ticks skipped because this replica is not leader',
    labelNames: ['scheduler'],
    registers: [registry],
  });

  const tickTotal = new Counter({
    name: 'synqdrive_scheduler_tick_total',
    help: 'Singleton scheduler tick executions on the leader replica',
    labelNames: ['scheduler', 'result'],
    registers: [registry],
  });

  return {
    leaderStatus,
    acquireTotal,
    renewTotal,
    leaderChangesTotal,
    skippedNotLeaderTotal,
    tickTotal,
  };
}
