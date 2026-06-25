import { Module } from '@nestjs/common';
import { CustomerVerificationController } from './customer-verification.controller';
import { CustomerVerificationReadModelService } from './customer-verification-read-model.service';
import { CustomerVerificationService } from './customer-verification.service';
import { DiditClient } from './providers/didit/didit.client';
import { DiditService } from './providers/didit/didit.service';
import { DiditSignatureService } from './providers/didit/didit-signature.service';
import { DiditWebhookController } from './providers/didit/didit-webhook.controller';
import { DiditWebhookService } from './providers/didit/didit-webhook.service';

@Module({
  controllers: [CustomerVerificationController, DiditWebhookController],
  providers: [
    CustomerVerificationService,
    CustomerVerificationReadModelService,
    DiditService,
    DiditClient,
    DiditSignatureService,
    DiditWebhookService,
  ],
  exports: [
    CustomerVerificationService,
    CustomerVerificationReadModelService,
    DiditService,
    DiditWebhookService,
  ],
})
export class CustomerVerificationModule {}
