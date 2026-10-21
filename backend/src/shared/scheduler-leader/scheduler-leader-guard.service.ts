import { Injectable } from '@nestjs/common';
import { SchedulerLeaderElectionService } from './scheduler-leader-election.service';
import type { SingletonGlobalSchedulerName } from './scheduler-leader.registry';

@Injectable()
export class SchedulerLeaderGuardService {
  constructor(private readonly election: SchedulerLeaderElectionService) {}

  isLeader(): boolean {
    return this.election.isLeader();
  }

  /**
   * Returns true when the scheduler tick should execute on this replica.
   */
  shouldRun(scheduler: SingletonGlobalSchedulerName): boolean {
    if (this.election.isLeader()) return true;
    this.election.recordSkippedTick(scheduler);
    return false;
  }

  /**
   * Executes `fn` only when this replica holds cluster scheduler leadership.
   */
  async runIfLeader<T>(
    scheduler: SingletonGlobalSchedulerName,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    if (!this.shouldRun(scheduler)) return undefined;
    try {
      const result = await fn();
      this.election.recordTick(scheduler, 'success');
      return result;
    } catch (err) {
      this.election.recordTick(scheduler, 'error');
      throw err;
    }
  }
}
