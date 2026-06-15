import { Module, forwardRef } from '@nestjs/common';
import { MisuseCasesController } from './misuse-cases.controller';
import { MisuseCasesService } from './misuse-cases.service';
import { MisuseCaseAggregatorService } from './misuse-case-aggregator.service';
import { MisuseCaseRulesService } from './misuse-case-rules.service';
import {
  MisuseCaseEvidenceService,
  MisuseCasePersistenceHelper,
} from './misuse-case-evidence.service';
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
  ],
  exports: [MisuseCaseAggregatorService, MisuseCasesService],
})
export class MisuseCasesModule {}
