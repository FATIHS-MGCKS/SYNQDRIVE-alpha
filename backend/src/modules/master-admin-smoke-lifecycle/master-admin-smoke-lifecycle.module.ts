import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { AuthApiModule } from '@modules/auth/auth.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { MasterAdminSmokeLifecycleService } from './master-admin-smoke-lifecycle.service';

@Module({
  imports: [ConfigModule, PrismaModule, ActivityLogModule, AuthApiModule],
  providers: [MasterAdminSmokeLifecycleService],
  exports: [MasterAdminSmokeLifecycleService],
})
export class MasterAdminSmokeLifecycleModule {}
