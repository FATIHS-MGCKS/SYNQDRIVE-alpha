import { describe, expect, it } from 'vitest';

import {
  formatTimelineDateTime,
  mapInvoiceTimelineEventToItem,
  mapInvoiceTimelinePanel,
} from './invoiceTimeline.mapper';
import type { InvoiceTimelinePanel } from './invoiceTimelineTypes';

const panelFixture = (): InvoiceTimelinePanel => ({
  sortOrder: 'desc',
  isLegacyReduced: false,
  timezone: 'Europe/Berlin',
  events: [
    {
      id: 'evt-2',
      kind: 'PAYMENT_PARTIAL',
      label: 'Teilzahlung erfasst',
      occurredAt: '2026-07-12T11:00:00.000Z',
      actorType: 'user',
      actorLabel: 'Maria Admin',
      channel: 'Banküberweisung',
      reference: 'REF-2',
      detail: '60,00 €',
      tone: 'watch',
    },
    {
      id: 'evt-1',
      kind: 'INVOICE_CREATED',
      label: 'Rechnung erstellt',
      occurredAt: '2026-07-01T08:00:00.000Z',
      actorType: 'system',
      actorLabel: 'System',
      channel: null,
      reference: 'FSM-2026-0001',
      detail: null,
      tone: 'neutral',
    },
  ],
});

describe('invoiceTimeline.mapper', () => {
  it('formats datetime in organization timezone', () => {
    const formatted = formatTimelineDateTime('2026-07-01T08:00:00.000Z', 'Europe/Berlin');
    expect(formatted).toMatch(/01\.07\.26/);
    expect(formatted).toMatch(/10:00/);
  });

  it('maps actor, channel and reference into actor line', () => {
    const item = mapInvoiceTimelineEventToItem(panelFixture().events[0], 'Europe/Berlin');
    expect(item.actorLine).toBe('Maria Admin · Banküberweisung · REF-2');
  });

  it('preserves backend event order for rendering', () => {
    const items = mapInvoiceTimelinePanel(panelFixture());
    expect(items.map((i) => i.id)).toEqual(['evt-2', 'evt-1']);
  });
});
