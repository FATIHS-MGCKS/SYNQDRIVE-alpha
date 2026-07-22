import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import iamDataRetentionConfig from '@config/iam-data-retention.config';
import { IamDataRetentionController } from './iam-data-retention.controller';
import { IamDataRetentionWorkerService } from './iam-data-retention-worker.service';
import { IamDsarExportService } from './iam-dsar-export.service';
import { IamLegalHoldService } from './iam-legal-hold.service';
import { IamUserDeletionService } from './iam-user-deletion.service';
import { IamDataRetentionMetricsService } from './iam-data-retention.metrics';
import { IamMfaModule } from '../iam-mfa/iam-mfa.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    ConfigModule.forFeature(iamDataRetentionConfig),
    forwardRef(() => IamMfaModule),
    UsersModule,
  ],
  controllers: [IamDataRetentionController],
  providers: [
    IamDataRetentionWorkerService,
    IamDsarExportService,
    IamLegalHoldService,
    IamUserDeletionService,
    IamDataRetentionMetricsService,
  ],
  exports: [
    IamDataRetentionWorkerService,
    IamDsarExportService,
    IamLegalHoldService,
    IamUserDeletionService,
    IamDataRetentionMetricsService,
  ],
})
export class IamDataRetentionModule {}
