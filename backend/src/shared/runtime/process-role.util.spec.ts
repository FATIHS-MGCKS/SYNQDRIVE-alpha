import {
  getProcessRole,
  shouldRegisterDocumentExtractionApi,
  shouldRegisterDocumentExtractionConsumers,
  shouldRunColocatedSchedulers,
} from './process-role.util';

describe('process-role.util', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.DOCUMENT_EXTRACTION_WORKER_SPLIT;
    delete process.env.SYNQDRIVE_PROCESS_ROLE;
  });

  afterAll(() => {
    process.env = env;
  });

  it('defaults to monolith all role when split is disabled', () => {
    expect(getProcessRole()).toBe('all');
    expect(shouldRegisterDocumentExtractionConsumers()).toBe(true);
    expect(shouldRegisterDocumentExtractionApi()).toBe(true);
    expect(shouldRunColocatedSchedulers()).toBe(true);
  });

  it('api role registers API surface only when split enabled', () => {
    process.env.DOCUMENT_EXTRACTION_WORKER_SPLIT = 'true';
    process.env.SYNQDRIVE_PROCESS_ROLE = 'api';
    expect(getProcessRole()).toBe('api');
    expect(shouldRegisterDocumentExtractionConsumers()).toBe(false);
    expect(shouldRegisterDocumentExtractionApi()).toBe(true);
    expect(shouldRunColocatedSchedulers()).toBe(true);
  });

  it('document-worker role registers consumers only when split enabled', () => {
    process.env.DOCUMENT_EXTRACTION_WORKER_SPLIT = 'true';
    process.env.SYNQDRIVE_PROCESS_ROLE = 'document-worker';
    expect(getProcessRole()).toBe('document-worker');
    expect(shouldRegisterDocumentExtractionConsumers()).toBe(true);
    expect(shouldRegisterDocumentExtractionApi()).toBe(false);
    expect(shouldRunColocatedSchedulers()).toBe(false);
  });
});
