import { canonicalPostgresTargetKeyV1, parsePostgresUrlLoginV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-postgres-url-identity.v1';

describe('m3-3-hv-h4-a3-o2-r3-h1 postgres url identity', () => {
  const base =
    'postgresql://synqdrive:secret@127.0.0.1:5432/synqdrive?schema=public&connection_limit=1';

  it('parses login from URL', () => {
    expect(parsePostgresUrlLoginV1(base)).toBe('synqdrive');
  });

  it('treats query-parameter differences as same canonical target', () => {
    const withoutLimit = 'postgresql://synqdrive:secret@127.0.0.1:5432/synqdrive?schema=public';
    expect(canonicalPostgresTargetKeyV1(base)).toBe(canonicalPostgresTargetKeyV1(withoutLimit));
  });
});
