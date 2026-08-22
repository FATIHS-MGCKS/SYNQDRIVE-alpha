import { BadRequestException } from '@nestjs/common';
import type { CommunicationConversationListQueryDto } from './dto/communication-read-shared.dto';

export function validateCommunicationConversationListQuery(
  query: CommunicationConversationListQueryDto,
): void {
  if (query.assignedUserId && query.unassigned) {
    throw new BadRequestException({
      message: 'assignedUserId and unassigned cannot be combined.',
      code: 'COMMUNICATION_READ_CONFLICTING_FILTERS',
    });
  }

  if (query.dateFrom && query.dateTo) {
    const fromMs = Date.parse(query.dateFrom);
    const toMs = Date.parse(query.dateTo);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs) || fromMs > toMs) {
      throw new BadRequestException({
        message: 'dateFrom must be less than or equal to dateTo.',
        code: 'COMMUNICATION_READ_INVALID_DATE_RANGE',
      });
    }
  }
}
