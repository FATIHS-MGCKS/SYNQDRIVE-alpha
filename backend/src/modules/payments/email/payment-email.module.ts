import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { OutboundEmailModule } from '@modules/outbound-email/outbound-email.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { PaymentEmailEnqueueService } from './payment-email-enqueue.service';
import { PaymentEmailOutboxRepository } from './payment-email-outbox.repository';
import { PaymentEmailSchedulerService } from './payment-email-scheduler.service';
import { PaymentEmailSenderService } from './payment-email-sender.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    OutboundEmailModule,
    ActivityLogModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.PAYMENT_EMAIL }),
  ],
  providers: [
    PaymentEmailOutboxRepository,
    PaymentEmailSenderService,
    PaymentEmailSchedulerService,
    PaymentEmailEnqueueService,
  ],
  exports: [
    PaymentEmailOutboxRepository,
    PaymentEmailSenderService,
    PaymentEmailSchedulerService,
    PaymentEmailEnqueueService,
  ],
})
export class PaymentEmailModule {}
