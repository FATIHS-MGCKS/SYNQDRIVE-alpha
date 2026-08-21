import { SmsConversation, SmsMessage } from '@prisma/client';

export type SmsIdempotencyPayloadMismatch =
  | 'recipient'
  | 'content'
  | 'recipient_and_content';

export function detectSmsIdempotencyPayloadMismatch(input: {
  existing: Pick<SmsMessage, 'content'> & {
    conversation: Pick<SmsConversation, 'contactPhoneNormalized'>;
  };
  recipientNormalized: string;
  content: string;
}): SmsIdempotencyPayloadMismatch | null {
  const recipientMatch =
    input.existing.conversation.contactPhoneNormalized === input.recipientNormalized;
  const contentMatch = input.existing.content === input.content;
  if (recipientMatch && contentMatch) {
    return null;
  }
  if (!recipientMatch && !contentMatch) {
    return 'recipient_and_content';
  }
  if (!recipientMatch) {
    return 'recipient';
  }
  return 'content';
}
