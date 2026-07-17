import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentWorkerAppModule } from './document-worker-app.module';
import { getProcessRole, isDocumentWorkerSplitEnabled } from '@shared/runtime/process-role.util';

function registerProcessHandlers(): void {
  const logger = new Logger('Process');

  process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logger.error({
      event: 'unhandledRejection',
      message,
      stack,
    });
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error({
      event: 'uncaughtException',
      message: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
}

async function bootstrapDocumentWorker(): Promise<void> {
  const logger = new Logger('DocumentWorkerBootstrap');

  if (!isDocumentWorkerSplitEnabled()) {
    logger.error({
      event: 'DOCUMENT_WORKER_BOOTSTRAP_FAILED',
      message: 'DOCUMENT_EXTRACTION_WORKER_SPLIT must be true for main-document-worker',
    });
    process.exit(1);
  }

  if (getProcessRole() !== 'document-worker') {
    logger.error({
      event: 'DOCUMENT_WORKER_BOOTSTRAP_FAILED',
      message: `SYNQDRIVE_PROCESS_ROLE must be document-worker (got ${getProcessRole()})`,
    });
    process.exit(1);
  }

  const appModule = await DocumentWorkerAppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.enableShutdownHooks();
  logger.log('SynqDrive document extraction worker running (no HTTP)');
  logger.log(`Process role: ${getProcessRole()}`);
}

registerProcessHandlers();

bootstrapDocumentWorker().catch((error: unknown) => {
  const logger = new Logger('DocumentWorkerBootstrap');
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  logger.error({
    event: 'DOCUMENT_WORKER_BOOTSTRAP_FAILED',
    message,
    stack,
  });
  process.exit(1);
});
