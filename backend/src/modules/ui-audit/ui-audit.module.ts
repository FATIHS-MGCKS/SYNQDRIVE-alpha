import { Global, Module } from '@nestjs/common';
import { UiAuditWriteDenyGuard } from './ui-audit-write-deny.guard';

@Global()
@Module({
  providers: [UiAuditWriteDenyGuard],
  exports: [UiAuditWriteDenyGuard],
})
export class UiAuditModule {}