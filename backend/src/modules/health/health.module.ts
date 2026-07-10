import { Module, forwardRef } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PrismaModule } from '@shared/database/prisma.module';
import { RedisModule } from '@shared/redis/redis.module';
import { DocumentExtractionModule } from '@modules/document-extraction/document-extraction.module';

@Module({
  imports: [PrismaModule, RedisModule, forwardRef(() => DocumentExtractionModule)],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
