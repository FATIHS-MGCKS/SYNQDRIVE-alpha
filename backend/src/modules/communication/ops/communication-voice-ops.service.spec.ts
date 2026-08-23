import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CommunicationChannel } from '@prisma/client';
import { CommunicationVoiceOpsService } from './communication-voice-ops.service';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { TaskPermissionService } from '@modules/tasks/task-permission.service';

describe('CommunicationVoiceOpsService (C9.2)', () => {
  const orgId = 'org-1';
  const canonicalId = 'conv-canonical';
  const nativeId = 'voice-native';
  const actor = { userId: 'user-1', displayName: 'Operator' };

  const prisma = {
    voiceConversation: { findFirst: jest.fn() },
    communicationConversation: { findFirst: jest.fn() },
    orgTask: { findFirst: jest.fn() },
  };
  const readRepository = { findConversationById: jest.fn() };
  const scope = { assertConversationReadable: jest.fn() };
  const tasks = { createManualTask: jest.fn() };
  const taskPermissions = { assert: jest.fn() };

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
    taskPermissions.assert.mockResolvedValue(undefined);
    prisma.orgTask.findFirst.mockResolvedValue(null);
    tasks.createManualTask.mockResolvedValue({ id: 'task-1' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommunicationVoiceOpsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CommunicationReadRepository, useValue: readRepository },
        { provide: CommunicationWriteScopeService, useValue: scope },
        { provide: TasksService, useValue: tasks },
        { provide: TaskPermissionService, useValue: taskPermissions },
      ],
    }).compile();

    service = moduleRef.get(CommunicationVoiceOpsService);
  });

  it('returns normalized voice call detail without raw transcript', async () => {
    const detail = await service.getVoiceCallDetail(orgId, canonicalId, actor.userId);
    expect(detail.callId).toBe(nativeId);
    expect(detail.summary).toBe('Customer booked pickup.');
    expect(detail.hasTranscript).toBe(true);
    expect(detail.maskedCallerNumber).toContain('***');
    expect(detail).not.toHaveProperty('transcript');
  });

  it('returns normalized transcript segments', async () => {
    const transcript = await service.getVoiceCallTranscript(orgId, canonicalId, actor.userId);
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
      service.getVoiceCallDetail(orgId, canonicalId, actor.userId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('createTaskFromCall requires tasks.create permission', async () => {
    taskPermissions.assert.mockRejectedValue(new ForbiddenException());
    await expect(
      service.createTaskFromCall(orgId, canonicalId, actor, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tasks.createManualTask).not.toHaveBeenCalled();
  });

  it('createTaskFromCall dedupes by idempotency key', async () => {
    prisma.orgTask.findFirst.mockResolvedValue({ id: 'task-existing' });
    const result = await service.createTaskFromCall(orgId, canonicalId, actor, {
      idempotencyKey: 'idem-1',
    });
    expect(result).toEqual({ taskId: 'task-existing', deduped: true });
    expect(tasks.createManualTask).not.toHaveBeenCalled();
  });

  it('createTaskFromCall creates manual task with communication provenance', async () => {
    const result = await service.createTaskFromCall(orgId, canonicalId, actor, {
      idempotencyKey: 'idem-2',
      title: 'Call follow-up',
    });
    expect(result).toEqual({ taskId: 'task-1', deduped: false });
    expect(tasks.createManualTask).toHaveBeenCalledWith(
      orgId,
      expect.objectContaining({
        title: 'Call follow-up',
        type: 'CUSTOMER_FOLLOWUP',
        metadata: expect.objectContaining({
          voiceConversationId: nativeId,
          communicationConversationId: canonicalId,
        }),
        dedupKey: `voice:cc-manual:${nativeId}:idem-2`,
      }),
      actor.userId,
    );
  });
});
