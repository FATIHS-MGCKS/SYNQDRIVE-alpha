/**
 * Bootstrap smoke for the dedicated document extraction worker process.
 * Sets role env before dynamic import so DocumentExtractionModule registers consumers.
 */
import { Logger } from '@nestjs/common';

async function runDocumentWorkerSmoke(): Promise<void> {
  const logger = new Logger('DocumentWorkerBootstrapSmoke');
  const prevSplit = process.env.DOCUMENT_EXTRACTION_WORKER_SPLIT;
  const prevRole = process.env.SYNQDRIVE_PROCESS_ROLE;

  process.env.DOCUMENT_EXTRACTION_WORKER_SPLIT = 'true';
  process.env.SYNQDRIVE_PROCESS_ROLE = 'document-worker';

  try {
    const { NestFactory } = await import('@nestjs/core');
    const { DocumentWorkerAppModule } = await import('../../src/document-worker-app.module');
    const appModule = await DocumentWorkerAppModule.forRootAsync();
    const app = await NestFactory.createApplicationContext(appModule, {
      logger: ['error', 'warn'],
    });
    await app.close();
    logger.log('DOCUMENT_WORKER_BOOTSTRAP_SMOKE_OK');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error({
      event: 'DOCUMENT_WORKER_BOOTSTRAP_SMOKE_FAILED',
      message,
      stack,
    });
    process.exit(1);
  } finally {
    if (prevSplit === undefined) delete process.env.DOCUMENT_EXTRACTION_WORKER_SPLIT;
    else process.env.DOCUMENT_EXTRACTION_WORKER_SPLIT = prevSplit;
    if (prevRole === undefined) delete process.env.SYNQDRIVE_PROCESS_ROLE;
    else process.env.SYNQDRIVE_PROCESS_ROLE = prevRole;
  }
}

runDocumentWorkerSmoke();
