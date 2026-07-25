import { Global, Module } from '@nestjs/common';
import { OperatorAuditController } from './operator-audit.controller';
import { OperatorAuditService } from './operator-audit.service';

@Global()
@Module({
  controllers: [OperatorAuditController],
  providers: [OperatorAuditService],
  exports: [OperatorAuditService],
})
export class OperatorAuditModule {}
