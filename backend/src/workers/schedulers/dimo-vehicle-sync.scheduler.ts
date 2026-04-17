import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queue-names';

/**
 * Producer for the dimo.vehicle.sync queue.
 *
 * The processor (`DimoVehicleSyncProcessor`) pulls the DIMO Identity vehicle
 * list once per invocation and reconciles it with our DimoVehicle records.
 * Previously the queue + processor existed without any producer, which meant
 * the job never ran and the sync only happened when triggered manually via
 * the admin controller — leading to stale vehicle metadata for orgs that
 * never clicked "Sync".
 *
 * The job is scheduled once per 24h. `upsertJobScheduler` is idempotent: on
 * restart it is updated in place rather than duplicated, so no cleanup is
 * required after the old orphaned processor is re-adopted. Job retention is
 * inherited from the global `defaultJobOptions` set in AppModule, so this
 * does not need its own removeOnComplete / removeOnFail config.
 */
@Injectable()
export class DimoVehicleSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(DimoVehicleSyncScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.DIMO_VEHICLE_SYNC)
    private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      'dimo-vehicle-sync-repeat',
      { every: 24 * 60 * 60 * 1000 },
      { name: 'dimo-vehicle-sync', data: {} },
    );
    this.logger.log('DIMO vehicle sync scheduled every 24 hours');
  }
}
