import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/api', () => ({
  api: {
    invoices: {
      getTimeline: vi.fn(),
    },
  },
}));

import { api } from '../../../lib/api';
import type { InvoiceTimelinePanel } from './invoiceTimelineTypes';

const panelFixture: InvoiceTimelinePanel = {
  sortOrder: 'desc',
  isLegacyReduced: false,
  timezone: 'Europe/Berlin',
  events: [],
};

describe('invoice timeline integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.invoices.getTimeline).mockResolvedValue(panelFixture);
  });

  it('loads timeline from invoice endpoint', async () => {
    const panel = await api.invoices.getTimeline('org-1', 'inv-1');
    expect(api.invoices.getTimeline).toHaveBeenCalledWith('org-1', 'inv-1');
    expect(panel.timezone).toBe('Europe/Berlin');
  });
});
