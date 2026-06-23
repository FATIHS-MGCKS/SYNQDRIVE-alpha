import { WhatsAppAiRouterService } from './whatsapp-ai-router.service';
import { WhatsAppAiContextService } from './whatsapp-ai-context.service';
import { WhatsAppAiToolsService } from './whatsapp-ai-tools.service';
import { WhatsAppMessagePolicyService } from './whatsapp-message-policy.service';
import { WhatsAppAiDecision, WhatsAppAiIntent, WhatsAppAiMode } from '@prisma/client';

describe('WhatsAppAiRouterService', () => {
  const prisma = {
    orgWhatsAppConfig: { findUnique: jest.fn() },
    whatsAppConversation: { findFirst: jest.fn(), update: jest.fn() },
    whatsAppAiSuggestion: { create: jest.fn() },
  };
  const context = { load: jest.fn() };
  const tools = { runTools: jest.fn() };
  const policy = new WhatsAppMessagePolicyService();
  const audit = { record: jest.fn() };

  let router: WhatsAppAiRouterService;

  const baseConfig = {
    isActive: true,
    aiMode: WhatsAppAiMode.FULL,
    serviceWindowOpen: true,
    aiCanCreateTasks: true,
  };

  const baseConvo = {
    id: 'convo-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    bookingId: 'bk-1',
    vehicleId: 'veh-1',
    contactName: 'Max',
    contactPhone: '+491701234567',
    status: 'OPEN',
  };

  const baseCtx = {
    organizationId: 'org-1',
    conversationId: 'convo-1',
    customer: { id: 'cust-1', displayName: 'Max', phone: '+491701234567' },
    hasActiveBooking: true,
    booking: {
      id: 'bk-1',
      status: 'Active',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
      pickupStationName: 'Kassel',
      returnStationName: 'Kassel',
      vehicleLabel: 'VW Golf',
    },
    vehicle: { id: 'veh-1', label: 'VW Golf', licensePlate: 'KS-SD 100' },
    station: {
      id: 'st-1',
      name: 'Kassel',
      handoverInstructions: 'Hof rechts',
      returnInstructions: 'Schlüsselbox',
      address: 'Hauptstr. 1',
    },
    sourceContextIds: {
      organizationId: 'org-1',
      conversationId: 'convo-1',
      customerId: 'cust-1',
      bookingId: 'bk-1',
      vehicleId: 'veh-1',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    router = new WhatsAppAiRouterService(
      prisma as any,
      context as any,
      tools as any,
      policy,
      audit as any,
    );
    prisma.orgWhatsAppConfig.findUnique.mockResolvedValue(baseConfig);
    prisma.whatsAppConversation.findFirst.mockResolvedValue(baseConvo);
    prisma.whatsAppConversation.update.mockResolvedValue({});
    prisma.whatsAppAiSuggestion.create.mockResolvedValue({ id: 'sug-1' });
    context.load.mockResolvedValue(baseCtx);
    tools.runTools.mockResolvedValue([
      {
        tool: 'getVehicleLocationSummary',
        ok: true,
        summary:
          'Dein Fahrzeug ist aktuell an der Station Kassel hinterlegt. Bitte prüfe vor Ort den Stellplatzhinweis in deiner Buchung.',
        data: { source: 'dimo' },
      },
    ]);
  });

  it('unknown customer → human required', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue({ ...baseConvo, customerId: null });
    context.load.mockResolvedValue({
      ...baseCtx,
      customer: null,
      hasActiveBooking: false,
      booking: null,
      vehicle: null,
    });
    tools.runTools.mockResolvedValue([]);

    const result = await router.route({
      orgId: 'org-1',
      conversationId: 'convo-1',
      messageContent: 'Wo steht mein Auto?',
    });

    expect(result.decision).toBe(WhatsAppAiDecision.HUMAN_REQUIRED);
    expect(result.riskFlags).toContain('UNKNOWN_CUSTOMER');
    expect(result.canSendAutomatically).toBe(false);
  });

  it('vehicle status with DIMO data → suggestion allowed', async () => {
    tools.runTools.mockResolvedValue([
      {
        tool: 'getVehicleStatus',
        ok: true,
        summary: 'Kilometerstand: 12000 km. Tankfüllung: 80 %',
      },
    ]);

    const result = await router.route({
      orgId: 'org-1',
      conversationId: 'convo-1',
      messageContent: 'Wie voll ist der Tank?',
    });

    expect(result.intent).toBe(WhatsAppAiIntent.VEHICLE_STATUS);
    expect(result.usedTools).toContain('getVehicleStatus');
    expect(result.suggestedReply).toContain('Tankfüllung');
    expect(result.canSendAutomatically).toBe(true);
  });

  it('accident intent → human required', async () => {
    const result = await router.route({
      orgId: 'org-1',
      conversationId: 'convo-1',
      messageContent: 'Ich hatte einen Unfall',
    });

    expect(result.intent).toBe(WhatsAppAiIntent.ACCIDENT);
    expect(result.decision).toBe(WhatsAppAiDecision.HUMAN_REQUIRED);
    expect(result.riskFlags).toContain('ACCIDENT');
    expect(result.canSendAutomatically).toBe(false);
  });

  it('booking change → human required', async () => {
    const result = await router.route({
      orgId: 'org-1',
      conversationId: 'convo-1',
      messageContent: 'Ich möchte die Buchung verlängern',
    });

    expect(result.intent).toBe(WhatsAppAiIntent.BOOKING_CHANGE);
    expect(result.decision).toBe(WhatsAppAiDecision.HUMAN_REQUIRED);
    expect(result.riskFlags).toContain('BOOKING_CHANGE');
  });

  it('payment problem → human required', async () => {
    const result = await router.route({
      orgId: 'org-1',
      conversationId: 'convo-1',
      messageContent: 'Meine Zahlung ist fehlgeschlagen',
    });

    expect(result.intent).toBe(WhatsAppAiIntent.PAYMENT);
    expect(result.decision).toBe(WhatsAppAiDecision.HUMAN_REQUIRED);
    expect(result.riskFlags).toContain('PAYMENT_PROBLEM');
  });

  it('AI OFF → blocked', async () => {
    prisma.orgWhatsAppConfig.findUnique.mockResolvedValue({
      ...baseConfig,
      aiMode: WhatsAppAiMode.OFF,
    });

    const result = await router.route({
      orgId: 'org-1',
      conversationId: 'convo-1',
      messageContent: 'Hallo',
    });

    expect(result.suggestedReply).toBeNull();
    expect(result.reason).toContain('disabled');
  });

  it('SUGGEST_ONLY → never auto send', async () => {
    prisma.orgWhatsAppConfig.findUnique.mockResolvedValue({
      ...baseConfig,
      aiMode: WhatsAppAiMode.SUGGEST_ONLY,
    });

    const result = await router.route({
      orgId: 'org-1',
      conversationId: 'convo-1',
      messageContent: 'Wie ist mein Buchungsstatus?',
    });

    expect(result.decision).toBe(WhatsAppAiDecision.SUGGEST_ONLY);
    expect(result.canSendAutomatically).toBe(false);
    expect(result.suggestedReply).toBeTruthy();
  });

  it('AUTO_SIMPLE → only safe intents auto allowed', async () => {
    prisma.orgWhatsAppConfig.findUnique.mockResolvedValue({
      ...baseConfig,
      aiMode: WhatsAppAiMode.AUTO_SIMPLE,
    });

    const safe = await router.route({
      orgId: 'org-1',
      conversationId: 'convo-1',
      messageContent: 'Wann ist meine Abholung?',
    });
    expect(safe.intent).toBe(WhatsAppAiIntent.PICKUP_INFO);
    expect(safe.canSendAutomatically).toBe(true);

    tools.runTools.mockResolvedValue([
      { tool: 'getVehicleStatus', ok: true, summary: 'Kilometerstand: 1000 km' },
    ]);
    const unsafe = await router.route({
      orgId: 'org-1',
      conversationId: 'convo-1',
      messageContent: 'Wie voll ist der Tank?',
    });
    expect(unsafe.intent).toBe(WhatsAppAiIntent.VEHICLE_STATUS);
    expect(unsafe.canSendAutomatically).toBe(false);
  });

  it('stale DIMO data → provider_data_stale flag on location', async () => {
    tools.runTools.mockResolvedValue([
      {
        tool: 'getVehicleLocationSummary',
        ok: false,
        summary: 'Aktuell keine verlässlichen Fahrzeugdaten verfügbar',
        stale: true,
      },
    ]);

    const result = await router.route({
      orgId: 'org-1',
      conversationId: 'convo-1',
      messageContent: 'Wo steht mein Auto?',
    });

    expect(result.riskFlags).toContain('PROVIDER_DATA_STALE');
    expect(result.decision).toBe(WhatsAppAiDecision.HUMAN_REQUIRED);
  });

  it('WhatsApp AI path does not import DIMO Agent ChatService', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const moduleDir = __dirname;
    const importPattern = /import\s*\{[^}]*\bChatService\b/;
    for (const file of [
      'whatsapp-ai-tools.service.ts',
      'whatsapp-ai-router.service.ts',
      'whatsapp.service.ts',
    ]) {
      const src = fs.readFileSync(path.join(moduleDir, file), 'utf8');
      expect(src).not.toMatch(importPattern);
    }
  });
});
