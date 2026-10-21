import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import reconciliationExecutionMutexConfig from './reconciliation-execution-mutex.config';
import { ReconciliationExecutionMutexService } from './reconciliation-execution-mutex.service';

@Global()
@Module({
  imports: [ConfigModule.forFeature(reconciliationExecutionMutexConfig)],
  providers: [ReconciliationExecutionMutexService],
  exports: [ReconciliationExecutionMutexService],
})
export class ReconciliationExecutionMutexModule {}
