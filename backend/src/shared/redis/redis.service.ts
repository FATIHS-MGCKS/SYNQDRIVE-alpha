import { Injectable, OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import redisConfig from '@config/redis.config';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(
    @Inject(redisConfig.KEY) private readonly redisConf: ConfigType<typeof redisConfig>,
  ) {
    super({
      host: redisConf.host,
      port: redisConf.port,
      password: redisConf.password,
      db: redisConf.db,
      maxRetriesPerRequest: null,
    });

    this.on('connect', () => this.logger.log('Redis connected'));
    this.on('error', (err) => this.logger.error('Redis error', err.message));
  }

  async onModuleDestroy() {
    await this.quit();
    this.logger.log('Redis disconnected');
  }
}
