import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queue-names';

@Injectable()
export class DimoDtcScheduler implements OnModuleInit {
  private readonly logger = new Logger(DimoDtcScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.DTC_POLL ?? 'dimo-dtc-poll')
    private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      'dtc-poll-repeat',
      { every: 3 * 60 * 60 * 1000 },
      { name: 'dtc-poll', data: {} },
    );
    this.logger.log('DTC poll scheduled every 3 hours');
  }
}
