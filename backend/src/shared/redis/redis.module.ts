import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisDistributedLockService } from './redis-distributed-lock.service';

@Global()
@Module({
  providers: [RedisService, RedisDistributedLockService],
  exports: [RedisService, RedisDistributedLockService],
})
export class RedisModule {}
