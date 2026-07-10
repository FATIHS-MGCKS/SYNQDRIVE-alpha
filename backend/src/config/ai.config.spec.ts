describe('ai.config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('defaults provider to mistral and enables streaming', async () => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_STREAMING_ENABLED;
    delete process.env.AI_EXTERNAL_ACTIONS_REQUIRE_APPROVAL;

    const aiConfig = (await import('./ai.config')).default;
    const config = aiConfig();

    expect(config.provider).toBe('mistral');
    expect(config.streamingEnabled).toBe(true);
    expect(config.externalActionsRequireApproval).toBe(true);
    expect(config.mistralChatModel).toBe('mistral-large-latest');
    expect(config.mistralOcrModel).toBe('mistral-ocr-latest');
    expect(config.mistralOcrTimeoutMs).toBe(120_000);
    expect(config.mistralOcrMaxFileBytes).toBe(10 * 1024 * 1024);
  });

  it('respects explicit model and feature flags', async () => {
    process.env.AI_PROVIDER = 'mistral';
    process.env.MISTRAL_CHAT_MODEL = 'custom-chat-model';
    process.env.MISTRAL_OCR_MODEL = 'custom-ocr-model';
    process.env.MISTRAL_OCR_TIMEOUT_MS = '45000';
    process.env.MISTRAL_OCR_MAX_FILE_BYTES = '2048';
    process.env.AI_STREAMING_ENABLED = 'false';
    process.env.AI_EXTERNAL_ACTIONS_REQUIRE_APPROVAL = '0';

    const aiConfig = (await import('./ai.config')).default;
    const config = aiConfig();

    expect(config.mistralChatModel).toBe('custom-chat-model');
    expect(config.mistralOcrModel).toBe('custom-ocr-model');
    expect(config.mistralOcrTimeoutMs).toBe(45_000);
    expect(config.mistralOcrMaxFileBytes).toBe(2048);
    expect(config.streamingEnabled).toBe(false);
    expect(config.externalActionsRequireApproval).toBe(false);
  });
});
