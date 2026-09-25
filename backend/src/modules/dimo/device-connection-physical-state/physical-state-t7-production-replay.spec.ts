import { existsSync, readFileSync } from 'fs';
import { join } from 'node:path';
import {
  summarizeT7ReplayExport,
  T7_RETENTION_EDGE_SHADOW_IDS,
  type T7ReplayExportRow,
} from './physical-state-t7-replay.engine';

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
    parentUnresolved?: number;
    legacyReasonStats?: { pattern_assumed?: number };
  };

  it('replays all 1552 rows with zero not-replayable and zero pattern-assumed legacy reasons', () => {
    const { summary } = summarizeT7ReplayExport(payload.rows);
    expect(summary.total).toBe(1552);
    expect(summary.replayed).toBe(1552);
    expect(summary.notReplayable).toBe(0);
    expect(summary.correctnessBlockingTotal).toBe(0);
    expect(summary.legacyReasonSourceCounts.pattern_assumed).toBe(0);
    expect(summary.byPattern.P1A).toBe(985);
    expect(summary.byPattern.P1B).toBe(148);
    expect(summary.byPattern.P2).toBe(416);
    expect(summary.byPattern.P3).toBe(3);
    expect(summary.byPattern.P1A_ORPHAN_PARENT ?? 0).toBe(0);
  });

  it('row-verifies all 15 PM2 retention-edge P1A rows via episode-model reconstruction', () => {
    const { summary } = summarizeT7ReplayExport(payload.rows);
    expect(summary.retentionEdge.rows).toBe(15);
    expect(summary.retentionEdge.perRowReplayed).toBe(15);
    expect(summary.retentionEdge.pass).toBe(15);
    expect(summary.retentionEdge.fail).toBe(0);
    expect(T7_RETENTION_EDGE_SHADOW_IDS.length).toBe(15);
  });

  it('export metadata confirms parent chain and legacy reconstruction completeness', () => {
    if (payload.parentUnresolved != null) {
      expect(payload.parentUnresolved).toBe(0);
    }
    if (payload.legacyReasonStats?.pattern_assumed != null) {
      expect(payload.legacyReasonStats.pattern_assumed).toBe(0);
    }
  });
});
