import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { PrismaService } from '@shared/database/prisma.service';
import {
  createM3_3HvH4ChargeSessionEvidenceWriterService,
  M3_3HvH4ChargeSessionEvidenceWriterService,
} from './m3-3-hv-h4-a3-charge-session-evidence-writer.service';
import { M3_3HvH4A3ReconciliationCursorStore } from './m3-3-hv-h4-a3-reconciliation-cursor.store';
import { M3_3HvH4A3ReconciliationService } from './m3-3-hv-h4-a3-reconciliation.service';

@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: M3_3HvH4ChargeSessionEvidenceWriterService,
      useFactory: (prisma: PrismaService) =>
        createM3_3HvH4ChargeSessionEvidenceWriterService(prisma),
      inject: [PrismaService],
    },
    M3_3HvH4A3ReconciliationCursorStore,
    M3_3HvH4A3ReconciliationService,
  ],
  exports: [M3_3HvH4A3ReconciliationService],
})
export class BatteryHvH4A3ReconciliationModule {}
