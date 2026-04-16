import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaModule } from '@shared/database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
