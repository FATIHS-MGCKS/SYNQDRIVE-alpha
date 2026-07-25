import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import operatorDataRetentionConfig from '@config/operator-data-retention.config';
import { DocumentExtractionModule } from '@modules/document-extraction/document-extraction.module';
import { OperatorDataRetentionController } from './operator-data-retention.controller';
import { OperatorDataRetentionService } from './operator-data-retention.service';
import { OperatorDataRetentionScheduler } from './operator-data-retention.scheduler';
import { OperatorEvidenceLegalHoldService } from './operator-evidence-legal-hold.service';
import { OperatorHandoverDraftService } from './operator-handover-draft.service';

@Module({
  imports: [ConfigModule.forFeature(operatorDataRetentionConfig), DocumentExtractionModule],
  controllers: [OperatorDataRetentionController],
  providers: [
    OperatorDataRetentionService,
    OperatorDataRetentionScheduler,
    OperatorEvidenceLegalHoldService,
    OperatorHandoverDraftService,
  ],
  exports: [
    OperatorDataRetentionService,
    OperatorEvidenceLegalHoldService,
    OperatorHandoverDraftService,
  ],
})
export class OperatorRetentionModule {}
