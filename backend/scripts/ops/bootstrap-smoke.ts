/**
 * Pre-deploy NestJS bootstrap smoke test.
 * Creates the application context and closes it without listening on a port.
 * Aborts deploy before `pm2 restart` when DI/module wiring is broken.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';

async function runBootstrapSmoke(): Promise<void> {
  const logger = new Logger('BootstrapSmoke');

  try {
    const appModule = await AppModule.forRootAsync();
    const app = await NestFactory.create(appModule, {
      logger: ['error', 'warn'],
    });
    await app.close();
    logger.log('BOOTSTRAP_SMOKE_OK');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error({
      event: 'BOOTSTRAP_SMOKE_FAILED',
      message,
      stack,
    });
    process.exit(1);
  }
}

runBootstrapSmoke();
