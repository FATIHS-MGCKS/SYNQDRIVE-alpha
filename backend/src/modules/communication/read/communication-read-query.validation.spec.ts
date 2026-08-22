import { BadRequestException } from '@nestjs/common';
import { validateCommunicationConversationListQuery } from './communication-read-query.validation';

describe('communication-read-query.validation', () => {
  it('rejects assignedUserId with unassigned', () => {
    expect(() =>
      validateCommunicationConversationListQuery({
        assignedUserId: '00000000-0000-4000-8000-000000000001',
        unassigned: true,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects dateFrom after dateTo', () => {
    expect(() =>
      validateCommunicationConversationListQuery({
        dateFrom: '2026-08-22T00:00:00.000Z',
        dateTo: '2026-08-21T00:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
  });
});
