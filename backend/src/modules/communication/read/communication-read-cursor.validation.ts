import { BadRequestException } from '@nestjs/common';

export const COMMUNICATION_CURSOR_MAX_LENGTH = 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STRICT_ISO_MS_Z =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function assertCommunicationCursorLength(cursor: string): void {
  if (cursor.length > COMMUNICATION_CURSOR_MAX_LENGTH) {
    throw new BadRequestException({
      message: 'Communication cursor exceeds maximum length.',
      code: 'COMMUNICATION_READ_INVALID_CURSOR',
    });
  }
}

export function assertCommunicationCursorUuid(id: string): void {
  if (!UUID_RE.test(id)) {
    throw new BadRequestException({
      message: 'Communication cursor contains an invalid id.',
      code: 'COMMUNICATION_READ_INVALID_CURSOR',
    });
  }
}

export function assertCommunicationCursorIsoTimestamp(value: string): void {
  if (!STRICT_ISO_MS_Z.test(value)) {
    throw new BadRequestException({
      message: 'Communication cursor contains an invalid timestamp.',
      code: 'COMMUNICATION_READ_INVALID_CURSOR',
    });
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) {
    throw new BadRequestException({
      message: 'Communication cursor contains an invalid timestamp.',
      code: 'COMMUNICATION_READ_INVALID_CURSOR',
    });
  }
}
