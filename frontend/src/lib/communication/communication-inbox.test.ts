import { describe, expect, it } from 'vitest';

import {
  buildCommunicationInboxApiQuery,
  mapShellChannelToApiChannel,
  mergeCommunicationInboxFilters,
  readCommunicationInboxFiltersFromUrl,
} from '../../rental/components/communication-center/communication-inbox-state';
import {
  COMMUNICATION_LIST_CONTRACT_FIXTURE,
  COMMUNICATION_LIST_PAGE_2_FIXTURE,
} from './communication-contract.fixture';
import { dedupeConversationsById } from './dedupe';
import { communicationInboxQuerySignature } from './query-keys';

describe('communication inbox state', () => {
  it('maps All channel to omitted API param', () => {
    expect(buildCommunicationInboxApiQuery('all', mergeCommunicationInboxFilters())).toEqual({});
  });

  it('maps WhatsApp/Voice/SMS channels', () => {
    expect(mapShellChannelToApiChannel('whatsapp')).toBe('WHATSAPP');
    expect(mapShellChannelToApiChannel('voice')).toBe('VOICE');
    expect(mapShellChannelToApiChannel('sms')).toBe('SMS');
    expect(buildCommunicationInboxApiQuery('whatsapp', mergeCommunicationInboxFilters())).toEqual({
      channel: 'WHATSAPP',
    });
  });

  it('maps unread, status, assignment, and search filters', () => {
    const query = buildCommunicationInboxApiQuery(
      'all',
      mergeCommunicationInboxFilters({
        search: 'Max',
        unreadOnly: true,
        status: 'HUMAN_REQUIRED',
        assignment: 'unassigned',
      }),
    );
    expect(query).toEqual({
      search: 'Max',
      unreadOnly: true,
      status: 'HUMAN_REQUIRED',
      unassigned: true,
    });
  });

  it('normalizes invalid URL filter values', () => {
    expect(
      readCommunicationInboxFiltersFromUrl(
        '?communicationStatus=INVALID&communicationAssignment=foo&communicationUnread=maybe',
      ),
    ).toEqual({});
  });

  it('reads valid URL inbox filters', () => {
    expect(
      readCommunicationInboxFiltersFromUrl(
        '?communicationSearch=Anna&communicationUnread=true&communicationStatus=HUMAN_REQUIRED&communicationAssignment=unassigned',
      ),
    ).toEqual({
      search: 'Anna',
      unreadOnly: true,
      status: 'HUMAN_REQUIRED',
      assignment: 'unassigned',
    });
  });

  it('includes org in query signature', () => {
    const sigA = communicationInboxQuerySignature('org-a', { search: 'x' });
    const sigB = communicationInboxQuerySignature('org-b', { search: 'x' });
    expect(sigA).not.toBe(sigB);
  });
});

describe('communication contract fixture', () => {
  it('accepts canonical C7 list response shape', () => {
    expect(COMMUNICATION_LIST_CONTRACT_FIXTURE.items).toHaveLength(3);
    expect(COMMUNICATION_LIST_CONTRACT_FIXTURE.items[0].displayLabel).toBe('Max Mustermann');
    expect(COMMUNICATION_LIST_CONTRACT_FIXTURE.items[0].lastMessagePreview).toBeTruthy();
    expect(COMMUNICATION_LIST_CONTRACT_FIXTURE.hasMore).toBe(true);
  });

  it('dedupes overlapping pagination ids', () => {
    const merged = dedupeConversationsById([
      ...COMMUNICATION_LIST_CONTRACT_FIXTURE.items,
      ...COMMUNICATION_LIST_PAGE_2_FIXTURE.items,
    ]);
    expect(merged.map((row) => row.id)).toEqual([
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102',
      '00000000-0000-4000-8000-000000000103',
      '00000000-0000-4000-8000-000000000104',
    ]);
  });
});
