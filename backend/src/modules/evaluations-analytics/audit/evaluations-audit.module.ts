import { Module } from '@nestjs/common';
import { BusinessAuditModule } from '@modules/business-audit/business-audit.module';
import { EvaluationsAuditService } from './evaluations-audit.service';

/**
 * E5C evaluations audit authority. Depends only on the canonical BusinessAudit
 * module (no dependency on E4/E5 feature modules) so the E4 insights service can
 * consume it without a module cycle.
 */
@Module({
  imports: [BusinessAuditModule],
  providers: [EvaluationsAuditService],
  exports: [EvaluationsAuditService],
})
export class EvaluationsAuditModule {}
