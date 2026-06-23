import {
  VoiceConversationDirection,
  VoiceConversationOutcome,
  VoiceConversationStatus,
} from '@prisma/client';
import {
  buildConversationWhere,
  extractConversationLinks,
  isConversationEscalated,
  maskCallerNumber,
} from './voice-conversation.util';

describe('voice-conversation.util', () => {
  it('masks caller numbers keeping last four digits', () => {
    expect(maskCallerNumber('+491701234567')).toBe('+*** *** 4567');
    expect(maskCallerNumber(null)).toBeNull();
  });

  it('extracts link ids from metadata', () => {
    expect(
      extractConversationLinks({
        linkedBookingId: 'b-1',
        linkedCustomerId: 'c-1',
        noise: 'ignore',
      }),
    ).toEqual({
      linkedBookingId: 'b-1',
      linkedCustomerId: 'c-1',
      linkedVehicleId: null,
      taskId: null,
    });
  });

  it('detects escalated conversations', () => {
    expect(
      isConversationEscalated({
        outcome: VoiceConversationOutcome.ESCALATED,
        escalationReason: null,
      }),
    ).toBe(true);
    expect(
      isConversationEscalated({
        outcome: VoiceConversationOutcome.RESOLVED,
        escalationReason: 'Caller requested human',
      }),
    ).toBe(true);
  });

  it('scopes conversation filters to organization', () => {
    const where = buildConversationWhere('org-1', {
      outcome: VoiceConversationOutcome.ESCALATED,
      direction: VoiceConversationDirection.INBOUND,
      status: VoiceConversationStatus.COMPLETED,
      escalatedOnly: true,
      search: 'booking',
    });
    expect(where).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([
          { organizationId: 'org-1' },
          { outcome: VoiceConversationOutcome.ESCALATED },
          { direction: VoiceConversationDirection.INBOUND },
          { status: VoiceConversationStatus.COMPLETED },
        ]),
      }),
    );
  });
});
