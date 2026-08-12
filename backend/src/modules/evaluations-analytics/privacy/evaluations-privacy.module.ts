import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { EvaluationsPrivacyResolver } from './evaluations-privacy.resolver';

/**
 * E5B privacy authority. A small, dependency-light module (no dependency on E4/E5
 * feature modules) so both the E4 insights service and E5 quality service can
 * consume it without a module cycle.
 */
@Module({
  imports: [PrismaModule],
  providers: [EvaluationsPrivacyResolver],
  exports: [EvaluationsPrivacyResolver],
})
export class EvaluationsPrivacyModule {}
