import { existsSync, readFileSync } from 'fs';
import { summarizeT7ReplayExport, type T7ReplayExportRow } from './physical-state-t7-replay.engine';

import { join } from 'node:path';

const exportPath =
  process.env.P25_T7_EXPORT_JSON ??
  join(process.cwd(), 'test-fixtures/p25-t7-unexplained-export.json');

describe('T7 production export replay (Option C hardened)', () => {
  if (!exportPath || !existsSync(exportPath)) {
    it.skip('requires P25_T7_EXPORT_JSON pointing at production export JSON', () => undefined);
    return;
  }

  const payload = JSON.parse(readFileSync(exportPath, 'utf8')) as {
    rows: T7ReplayExportRow[];
  };

  it('replays all reconstructable rows without correctness-blocking surprises', () => {
    const { summary } = summarizeT7ReplayExport(payload.rows);
    expect(summary.total).toBe(1552);
    expect(summary.correctnessBlockingTotal).toBe(0);
    expect(summary.notReplayable).toBeLessThanOrEqual(3);
    expect(summary.byPattern.P1A + (summary.byPattern.P1A_ORPHAN_PARENT ?? 0)).toBe(985);
    expect(summary.byPattern.P1B).toBe(148);
    expect(summary.byPattern.P2).toBe(416);
    expect(summary.byPattern.P3).toBe(3);
  });
});
