/**
 * Composition module for tests/diagnostics only — NOT registered in AppModule (S4F dormant).
 */
import { Module } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DiV0S4fReconciliationService } from './di-v0-s4f-reconciliation.service';

@Module({
  providers: [
    {
      provide: DiV0S4fReconciliationService,
      useFactory: (prisma: PrismaService) => new DiV0S4fReconciliationService(prisma),
      inject: [PrismaService],
    },
  ],
  exports: [DiV0S4fReconciliationService],
})
export class DiV0S4fObservabilityModule {}
