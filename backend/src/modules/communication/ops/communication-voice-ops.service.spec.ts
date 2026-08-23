import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CommunicationChannel } from '@prisma/client';
import { CommunicationVoiceOpsService } from './communication-voice-ops.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';

describe('CommunicationVoiceOpsService (C9.2)', () => {
  const orgId = 'org-1';
  const canonicalId = 'conv-canonical';
  const nativeId = 'voice-native';
  const actorUserId = 'user-1';

  const prisma = {
    voiceConversation: { findFirst: jest.fn() },
    communicationConversation: { findFirst: jest.fn() },
  };
  const readRepository = { findConversationById: jest.fn() };
  const scope = { assertConversationReadable: jest.fn() };

  let service: CommunicationVoiceOpsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    readRepository.findConversationById.mockResolvedValue({
      id: canonicalId,
      channel: CommunicationChannel.VOICE,
      customerId: 'cust-1',
      bookingId: null,
      vehicleId: null,
      stationId: null,
    });
    prisma.communicationConversation.findFirst.mockResolvedValue({
      nativeConversationId: nativeId,
    });
    prisma.voiceConversation.findFirst.mockResolvedValue({
      id: nativeId,
      organizationId: orgId,
      direction: 'INBOUND',
      status: 'COMPLETED',
      outcome: 'RESOLVED',
      startedAt: new Date('2026-08-23T10:00:00.000Z'),
      endedAt: new Date('2026-08-23T10:05:00.000Z'),
      durationSeconds: 300,
      summary: 'Customer booked pickup.',
      escalationReason: null,
      transcript: JSON.stringify([{ role: 'user', message: 'Hello' }]),
      errorMessage: null,
      callerNumber: '+491701234567',
      metadata: {},
    });
    scope.assertConversationReadable.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommunicationVoiceOpsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommunicationReadRepository, useValue: readRepository },
        { provide: CommunicationWriteScopeService, useValue: scope },
      ],
    }).compile();

    service = moduleRef.get(CommunicationVoiceOpsService);
  });

  it('returns normalized voice call detail without raw transcript or provider error text', async () => {
    const detail = await service.getVoiceCallDetail(orgId, canonicalId, actorUserId);
    expect(detail.callId).toBe(nativeId);
    expect(detail.summary).toBe('Customer booked pickup.');
    expect(detail.hasTranscript).toBe(true);
    expect(detail.maskedCallerNumber).toContain('***');
    expect(detail).not.toHaveProperty('transcript');
    expect(detail).not.toHaveProperty('errorMessage');
    expect(detail.failureState).toBeNull();
  });

  it('returns safe failure state instead of raw provider error text', async () => {
    prisma.voiceConversation.findFirst.mockResolvedValue({
      id: nativeId,
      organizationId: orgId,
      direction: 'INBOUND',
      status: 'FAILED',
      outcome: 'FAILED',
      startedAt: new Date('2026-08-23T10:00:00.000Z'),
      endedAt: null,
      durationSeconds: null,
      summary: null,
      escalationReason: null,
      transcript: null,
      errorMessage: 'ElevenLabs stack trace with secret token',
      callerNumber: null,
      metadata: {},
    });

    const detail = await service.getVoiceCallDetail(orgId, canonicalId, actorUserId);
    expect(detail.failureState).toBe('CALL_FAILED');
    expect(detail).not.toHaveProperty('errorMessage');
    expect(JSON.stringify(detail)).not.toContain('ElevenLabs');
  });

  it('returns normalized transcript segments', async () => {
    const transcript = await service.getVoiceCallTranscript(orgId, canonicalId, actorUserId);
    expect(transcript.availability).toBe('AVAILABLE');
    expect(transcript.segments[0]).toMatchObject({
      speaker: 'CUSTOMER',
      text: 'Hello',
    });
    expect(JSON.stringify(transcript)).not.toContain('tool_arguments');
  });

  it('rejects non-voice conversations', async () => {
    readRepository.findConversationById.mockResolvedValue({
      id: canonicalId,
      channel: CommunicationChannel.WHATSAPP,
    });
    await expect(
      service.getVoiceCallDetail(orgId, canonicalId, actorUserId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
