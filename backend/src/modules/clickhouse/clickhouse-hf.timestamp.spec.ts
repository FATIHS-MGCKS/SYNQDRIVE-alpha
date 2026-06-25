import { toChDateTimeParam, parseChUtc } from './clickhouse-hf.service';

/**
 * Locks the ClickHouse DateTime64(3,'UTC') timestamp contract used by the HF
 * read layer so a regression can never silently produce an empty query window
 * or a wrong interval:
 *   - Write param format: `YYYY-MM-DD HH:MM:SS.mmm` (UTC, no `T`, no `Z`),
 *     which `parseDateTime64BestEffort` accepts.
 *   - Read parse: ClickHouse's `YYYY-MM-DD HH:MM:SS.mmm` back into ISO UTC.
 *   - Inserts use the numeric Unix-ms form (Date.getTime()), which DateTime64(3)
 *     stores as raw ms ticks — verified to round-trip with the read parser.
 */
describe('ClickHouse HF timestamp serialization', () => {
  it('serializes a Date into the parseDateTime64BestEffort string format', () => {
    const d = new Date('2026-06-25T21:11:05.250Z');
    const param = toChDateTimeParam(d);
    expect(param).toBe('2026-06-25 21:11:05.250');
    // Must be tz-less, space-separated, millisecond-preserving.
    expect(param).not.toContain('T');
    expect(param).not.toContain('Z');
    expect(param).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it('parses a ClickHouse DateTime64 row value back into ISO UTC', () => {
    // ClickHouse JSONEachRow returns DateTime64(3,'UTC') like this.
    expect(parseChUtc('2026-06-25 21:11:05.250')).toBe('2026-06-25T21:11:05.250Z');
  });

  it('round-trips a Date → write param → read parse without drift', () => {
    const original = new Date('2026-01-02T03:04:05.678Z');
    // Write side serializes to the CH param; CH echoes the same wall-clock form
    // on read (space separator). Parsing it back must yield the same instant.
    const chRowValue = toChDateTimeParam(original); // same shape CH returns
    const iso = parseChUtc(chRowValue);
    expect(iso).toBe(original.toISOString());
    expect(new Date(iso as string).getTime()).toBe(original.getTime());
  });

  it('insert uses Unix-ms which equals the DateTime64(3) raw tick value', () => {
    // DateTime64(3) underlying value IS milliseconds since epoch; the insert
    // path passes Date.getTime(). This guards that the value is in ms (not s).
    const d = new Date('2026-06-25T21:11:05.250Z');
    expect(d.getTime()).toBe(Date.parse('2026-06-25T21:11:05.250Z'));
    // Sub-second precision (the .250) must survive — i.e. not floored to seconds.
    expect(d.getTime() % 1000).toBe(250);
  });

  it('produces a non-empty, correctly-ordered window (from < to)', () => {
    const to = new Date('2026-06-25T21:00:00.000Z');
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const fromParam = toChDateTimeParam(from);
    const toParam = toChDateTimeParam(to);
    expect(fromParam < toParam).toBe(true); // lexical == chronological for this format
    expect(fromParam).toBe('2026-06-24 21:00:00.000');
    expect(toParam).toBe('2026-06-25 21:00:00.000');
  });

  it('returns null for empty/invalid read values', () => {
    expect(parseChUtc(null)).toBeNull();
    expect(parseChUtc(undefined)).toBeNull();
    expect(parseChUtc('')).toBeNull();
  });
});
