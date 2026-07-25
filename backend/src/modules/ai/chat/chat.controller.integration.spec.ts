import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { FLEET_AI_FLOW_SCENARIOS } from '../__fixtures__/fleet-ai-flow.fixtures';
import {
  FLEET_AI_ORG_ID,
  FLEET_AI_USER_ID,
} from '../__fixtures__/fleet-ai-test.fixtures';

const passGuard = { canActivate: () => true };

describe('ChatController — HTTP integration', () => {
  let app: INestApplication;
  const chatService = {
    isConfigured: jest.fn().mockReturnValue(true),
    ensureAgent: jest.fn(),
    getAgentInfo: jest.fn().mockResolvedValue({ agent: null, messageCount: 0 }),
    getHistory: jest.fn().mockResolvedValue([]),
    clearHistory: jest.fn().mockResolvedValue({ cleared: true }),
    sendMessage: jest.fn(),
    streamMessage: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: chatService }],
    })
      .overrideGuard(RolesGuard)
      .useValue(passGuard)
      .overrideGuard(OrgScopingGuard)
      .useValue(passGuard)
      .overrideGuard(PermissionsGuard)
      .useValue(passGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /chat/message returns structured assistant payload', async () => {
    const scenario = FLEET_AI_FLOW_SCENARIOS.find((s) => s.id === 'location-fresh')!;
    chatService.sendMessage.mockResolvedValue({
      id: 'msg-out-1',
      role: 'assistant',
      content: 'Live-Position für WOB-L 7503.',
      createdAt: new Date('2026-07-24T10:00:00.000Z'),
      structured: {
        responseType: 'LOCATION_SUMMARY',
        partial: false,
        warnings: [],
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${FLEET_AI_ORG_ID}/chat/message`)
      .send({ content: scenario.messages.de })
      .expect(201);

    expect(res.body.structured.responseType).toBe('LOCATION_SUMMARY');
    expect(chatService.sendMessage).toHaveBeenCalledWith(
      FLEET_AI_ORG_ID,
      scenario.messages.de,
      undefined,
      expect.stringMatching(/127\.0\.0\.1|::ffff/),
    );
  });

  it('POST /chat/message/stream emits SSE result event', async () => {
    const scenario = FLEET_AI_FLOW_SCENARIOS.find((s) => s.id === 'overdue-true')!;
    chatService.streamMessage.mockImplementation(async (_org, _content, emit, isClosed) => {
      if (!isClosed()) {
        emit('status', { agentReady: true });
        emit('progress', { type: 'thinking', content: 'Analysing…' });
        emit('result', {
          id: 'msg-stream-1',
          role: 'assistant',
          content: 'Überfällige Rückgabe für WOB-L 7503.',
          createdAt: new Date().toISOString(),
          structured: { responseType: 'OVERDUE_EXPLANATION', partial: false },
        });
      }
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${FLEET_AI_ORG_ID}/chat/message/stream`)
      .send({ content: scenario.messages.de })
      .expect(201);

    expect(res.headers['content-type']).toMatch(/event-stream/);
    expect(res.text).toContain('event: result');
    expect(res.text).toContain('OVERDUE_EXPLANATION');
  });

  it('rejects empty message without calling chat service', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${FLEET_AI_ORG_ID}/chat/message`)
      .send({ content: '   ' })
      .expect(201);

    expect(chatService.sendMessage).not.toHaveBeenCalled();
  });
});
