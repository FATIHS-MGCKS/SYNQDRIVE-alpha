import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OperatorConnectivityBanner } from './OperatorConnectivityBanner';

vi.mock('../hooks/useOperatorNetworkStatus', () => ({
  useOperatorNetworkStatus: vi.fn(),
}));

import { useOperatorNetworkStatus } from '../hooks/useOperatorNetworkStatus';

describe('OperatorConnectivityBanner', () => {
  it('renders nothing while online', () => {
    vi.mocked(useOperatorNetworkStatus).mockReturnValue({ online: true });
    expect(renderToStaticMarkup(<OperatorConnectivityBanner />)).toBe('');
  });

  it('shows accessible offline status banner', () => {
    vi.mocked(useOperatorNetworkStatus).mockReturnValue({ online: false });
    const html = renderToStaticMarkup(<OperatorConnectivityBanner />);
    expect(html).toContain('role="status"');
    expect(html).toContain('offline');
  });
});
