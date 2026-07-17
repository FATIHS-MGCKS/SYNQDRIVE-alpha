import { createHmac } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { VoiceConversationLifecycleState } from '@prisma/client';
import { validateElevenLabsWebhookSignature } from './elevenlabs-signature.util';
import {
  canAdvanceLifecycleState,
  mapTwilioCallStatusToLifecycle,
} from './voice-conversation-lifecycle-state.util';
import { hashWebhookPayload, VoiceWebhookPayloadError } from './voice-webhook-payload.util';
import { redactTwilioFormPayload } from './voice-webhook-redaction.util';
import { VOICE_WEBHOOK_MAX_PAYLOAD_BYTES } from './voice-webhook-ingestion.constants';

describe('elevenlabs-signature.util', () => {
  const secret = 'test-secret';
  const body = Buffer.from(JSON.stringify({ conversation_id: 'conv-1' }));
  const timestamp = '1700000000';
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${body.toString('utf8')}`)
    .digest('hex');

  it('accepts a valid signature', () => {
    expect(
      validateElevenLabsWebhookSignature({
        rawBody: body,
        signatureHeader: `t=${timestamp},v0=${signature}`,
        secret,
        nowSeconds: 1700000000,
      }),
    ).toBe(true);
  });

  it('rejects an invalid signature', () => {
    expect(
      validateElevenLabsWebhookSignature({
        rawBody: body,
        signatureHeader: `t=${timestamp},v0=deadbeef`,
        secret,
        nowSeconds: 1700000000,
      }),
    ).toBe(false);
  });

  it('rejects expired signatures', () => {
    expect(
      validateElevenLabsWebhookSignature({
        rawBody: body,
        signatureHeader: `t=${timestamp},v0=${signature}`,
        secret,
        nowSeconds: 1700009999,
      }),
    ).toBe(false);
  });
});

describe('voice-conversation-lifecycle-state.util', () => {
  it('does not allow backwards transitions', () => {
    expect(
      canAdvanceLifecycleState(
        VoiceConversationLifecycleState.CONNECTED,
        VoiceConversationLifecycleState.RINGING,
      ),
    ).toBe(false);
  });

  it('allows forward transitions', () => {
    expect(
      canAdvanceLifecycleState(
        VoiceConversationLifecycleState.RINGING,
        VoiceConversationLifecycleState.CONNECTED,
      ),
    ).toBe(true);
  });

  it('maps twilio ringing to lifecycle ringing', () => {
    expect(mapTwilioCallStatusToLifecycle('ringing')).toBe(
      VoiceConversationLifecycleState.RINGING,
    );
  });

  it('blocks changes after finalized', () => {
    expect(
      canAdvanceLifecycleState(
        VoiceConversationLifecycleState.FINALIZED,
        VoiceConversationLifecycleState.CONNECTED,
      ),
    ).toBe(false);
  });
});

describe('voice-webhook-payload.util', () => {
  it('hashes payloads deterministically', () => {
    const first = hashWebhookPayload(Buffer.from('{"a":1}'));
    const second = hashWebhookPayload(Buffer.from('{"a":1}'));
    expect(first).toBe(second);
  });

  it('rejects oversized payloads', () => {
    const oversized = Buffer.alloc(VOICE_WEBHOOK_MAX_PAYLOAD_BYTES + 1, 1);
    expect(() => hashWebhookPayload(oversized)).not.toThrow();
    expect(() => {
      const { parseJsonPayload } = require('./voice-webhook-payload.util');
      parseJsonPayload(oversized);
    }).toThrow(VoiceWebhookPayloadError);
  });
});

describe('voice-webhook-redaction.util', () => {
  it('masks twilio phone fields', () => {
    const redacted = redactTwilioFormPayload({ From: '+491701234567', CallSid: 'CA123' });
    expect(redacted.From).not.toBe('+491701234567');
    expect(redacted.CallSid).toBe('CA123');
  });
});
