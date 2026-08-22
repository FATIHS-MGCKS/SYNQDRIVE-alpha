import { describe, expect, it } from 'vitest';
import {
  buildTimelineWithDateSeparators,
  callEventLabelKey,
  contentTypeLabelKey,
  lifecycleEventLabelKey,
  mapEventToPresentation,
  sortEventsChronologically,
} from './timeline-presentation';
import {
  COMMUNICATION_TIMELINE_FIXTURE_EVENTS,
  COMMUNICATION_TIMELINE_PAGE_1,
  COMMUNICATION_TIMELINE_PAGE_2,
} from './communication-timeline.fixture';

const CHANNEL = 'WHATSAPP' as const;

describe('timeline-presentation mapper', () => {
  it('maps MESSAGE_RECEIVED + TEXT to inbound message', () => {
    const item = mapEventToPresentation(
      COMMUNICATION_TIMELINE_FIXTURE_EVENTS.whatsappInboundText,
      CHANNEL,
    );
    expect(item?.kind).toBe('message');
    if (item?.kind === 'message') {
      expect(item.direction).toBe('inbound');
      expect(item.contentType).toBe('TEXT');
      expect(item.text).toBe('Hello, I need help with pickup');
    }
  });

  it('maps MESSAGE_SENT + TEXT to outbound message', () => {
    const item = mapEventToPresentation(
      COMMUNICATION_TIMELINE_FIXTURE_EVENTS.whatsappOutboundText,
      CHANNEL,
    );
    expect(item?.kind).toBe('message');
    if (item?.kind === 'message') {
      expect(item.direction).toBe('outbound');
    }
  });

  it('maps IMAGE to semantic media message', () => {
    const item = mapEventToPresentation(
      COMMUNICATION_TIMELINE_FIXTURE_EVENTS.imageEvent,
      CHANNEL,
    );
    expect(item?.kind).toBe('message');
    if (item?.kind === 'message') {
      expect(item.contentType).toBe('IMAGE');
      expect(item.hasAttachments).toBe(true);
    }
  });

  it('maps MESSAGE event with null content to unavailable', () => {
    const item = mapEventToPresentation(
      COMMUNICATION_TIMELINE_FIXTURE_EVENTS.missingContentEvent,
      CHANNEL,
    );
    expect(item?.kind).toBe('message');
    if (item?.kind === 'message') {
      expect(item.contentType).toBe('UNAVAILABLE');
    }
  });

  it('maps delivery event to lifecycle item', () => {
    const item = mapEventToPresentation(
      COMMUNICATION_TIMELINE_FIXTURE_EVENTS.deliveryEvent,
      CHANNEL,
    );
    expect(item?.kind).toBe('lifecycle');
  });

  it('maps voice event to call item', () => {
    const item = mapEventToPresentation(
      COMMUNICATION_TIMELINE_FIXTURE_EVENTS.voiceCallEnded,
      'VOICE',
    );
    expect(item?.kind).toBe('call');
    if (item?.kind === 'call') {
      expect(item.durationSeconds).toBe(204);
    }
  });

  it('sorts events chronologically oldest to newest', () => {
    const sorted = sortEventsChronologically(COMMUNICATION_TIMELINE_PAGE_1.items);
    expect(sorted[0]?.occurredAt <= sorted[sorted.length - 1]?.occurredAt).toBe(true);
    expect(sorted[0]?.id).toBe('evt-001');
  });

  it('builds unique message items from unique events', () => {
    const events = [
      COMMUNICATION_TIMELINE_FIXTURE_EVENTS.whatsappInboundText,
      COMMUNICATION_TIMELINE_FIXTURE_EVENTS.whatsappOutboundText,
    ];
    const timeline = buildTimelineWithDateSeparators(events, CHANNEL);
    const messageIds = timeline
      .filter((item) => item.kind === 'message')
      .map((item) => item.id);
    expect(new Set(messageIds).size).toBe(2);
  });

  it('does not expose provider fields in presentation model', () => {
    const item = mapEventToPresentation(
      COMMUNICATION_TIMELINE_FIXTURE_EVENTS.imageEvent,
      CHANNEL,
    );
    expect(JSON.stringify(item)).not.toContain('provider.example');
    expect(JSON.stringify(item)).not.toContain('nativeMessage');
    expect(JSON.stringify(item)).not.toContain('providerUrl');
  });

  it('content type labels use i18n keys not raw enums', () => {
    expect(contentTypeLabelKey('IMAGE')).toBe('communication.timeline.image');
    expect(contentTypeLabelKey('UNSUPPORTED')).toBe('communication.timeline.unsupportedMessage');
    expect(contentTypeLabelKey('UNAVAILABLE')).toBe('communication.timeline.messageUnavailable');
  });

  it('lifecycle labels use i18n keys', () => {
    expect(lifecycleEventLabelKey('MESSAGE_DELIVERED')).toBe('communication.timeline.delivered');
    expect(callEventLabelKey('CALL_ENDED', 'INBOUND')).toBe('communication.timeline.callCompleted');
  });
});
