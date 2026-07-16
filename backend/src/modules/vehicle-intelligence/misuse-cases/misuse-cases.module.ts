import { Module, forwardRef } from '@nestjs/common';
import { MisuseCasesController } from './misuse-cases.controller';
import { MisuseCasesService } from './misuse-cases.service';
import { MisuseCaseAggregatorService } from './misuse-case-aggregator.service';
import { MisuseCaseRulesService } from './misuse-case-rules.service';
import { MisuseCaseEvidenceService } from './misuse-case-evidence.service';
import { MisuseCasePersistenceHelper } from './misuse-case-persistence.helper';
import { MisuseCaseLifecycleService } from './misuse-case-lifecycle/misuse-case-lifecycle.service';
import { DimoModule } from '../../dimo/dimo.module';

@Module({
  imports: [forwardRef(() => DimoModule)],
  controllers: [MisuseCasesController],
  providers: [
    MisuseCasesService,
    MisuseCaseAggregatorService,
    MisuseCaseRulesService,
    MisuseCaseEvidenceService,
    MisuseCasePersistenceHelper,
    MisuseCaseLifecycleService,
  ],
  exports: [MisuseCaseAggregatorService, MisuseCasesService, MisuseCaseLifecycleService],
})
export class MisuseCasesModule {}
