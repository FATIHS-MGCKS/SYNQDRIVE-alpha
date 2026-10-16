#!/usr/bin/env ts-node
/**
 * EXP021 — read-only spacing analysis from an existing provider-compare raw JSON.
 * No DIMO calls; no DB writes.
 */
import * as fs from 'node:fs';

type SignalRow = { timestamp?: string };

function parseTsUtc(s: string): number {
  return Date.parse(s.replace(/\.(\d{3})Z$/, '$1Z'));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const k = ((sorted.length - 1) * p) / 100;
  const f = Math.floor(k);
  const c = Math.min(f + 1, sorted.length - 1);
  if (f === c) return sorted[f];
  return sorted[f] + (sorted[c] - sorted[f]) * (k - f);
}

function gapBucket(seconds: number): string {
  if (seconds === 1) return '1s';
  if (seconds === 2) return '2s';
  if (seconds >= 3 && seconds <= 5) return '3-5s';
  if (seconds >= 6 && seconds <= 10) return '6-10s';
  return '>10s';
}

function main(): void {
  const rawPath =
    process.env.EXP021_TIMING_RAW_JSON ?? '/opt/cursor/artifacts/exp021-provider-position-compare-533b2bf8.raw.json';
  const comparePath =
    process.env.EXP021_TIMING_COMPARE_JSON ?? '/opt/cursor/artifacts/exp021-provider-position-compare-533b2bf8.json';
  const outPath = process.env.EXP021_TIMING_OUT ?? '/opt/cursor/artifacts/exp021-position-timing-analysis.json';

  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8')) as { signals?: SignalRow[] };
  const compare = JSON.parse(fs.readFileSync(comparePath, 'utf8')) as Record<string, unknown>;
  const signals = Array.isArray(raw.signals) ? raw.signals : [];
  const labels = [...new Set(signals.map((r) => r.timestamp).filter((t): t is string => typeof t === 'string'))].sort();

  const windowFrom = parseTsUtc('2026-10-14T14:47:05Z');
  const windowTo = parseTsUtc('2026-10-14T16:05:19Z');
  const expectedBuckets = Math.round((windowTo - windowFrom) / 1000);
  const pwFrom = parseTsUtc('2026-10-14T14:55:43Z');
  const pwTo = parseTsUtc('2026-10-14T15:21:53Z');

  const gaps: number[] = [];
  for (let i = 1; i < labels.length; i++) {
    gaps.push(Math.round((parseTsUtc(labels[i]) - parseTsUtc(labels[i - 1])) / 1000));
  }

  const gapHist: Record<string, number> = { '1s': 0, '2s': 0, '3-5s': 0, '6-10s': 0, '>10s': 0 };
  for (const g of gaps) gapHist[gapBucket(g)] += 1;

  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const leadingGapS = labels.length ? Math.round((parseTsUtc(labels[0]) - windowFrom) / 1000) : expectedBuckets;
  const trailingGapS = labels.length
    ? Math.round((windowTo - parseTsUtc(labels[labels.length - 1])) / 1000)
    : expectedBuckets;

  const presentSec = new Set(labels.map((l) => Math.round((parseTsUtc(l) - windowFrom) / 1000)));
  const absentRuns: Array<{ startSec: number; durationSec: number }> = [];
  let run = 0;
  let runStart = 0;
  for (let sec = 0; sec < expectedBuckets; sec++) {
    if (!presentSec.has(sec)) {
      if (run === 0) runStart = sec;
      run += 1;
    } else if (run > 0) {
      absentRuns.push({ startSec: runStart, durationSec: run });
      run = 0;
    }
  }
  if (run > 0) absentRuns.push({ startSec: runStart, durationSec: run });

  const longRuns = absentRuns.filter((r) => r.durationSec > 10);
  const absentSeconds = expectedBuckets - presentSec.size;
  const secondsInLongAbsentRuns = longRuns.reduce((s, r) => s + r.durationSec, 0);

  const longGaps = gaps
    .map((g, i) => ({
      from: labels[i],
      to: labels[i + 1],
      gapSeconds: g,
    }))
    .filter((x) => x.gapSeconds > 10);

  const problemLabels = labels.filter((l) => {
    const t = parseTsUtc(l);
    return t >= pwFrom && t < pwTo;
  });
  const problemTimeline = problemLabels.map((l, idx) => {
    const gapFromPrevOrStart =
      idx === 0
        ? Math.round((parseTsUtc(l) - pwFrom) / 1000)
        : Math.round((parseTsUtc(l) - parseTsUtc(problemLabels[idx - 1])) / 1000);
    return { timestamp: l, gapFromPrevOrStartSeconds: gapFromPrevOrStart };
  });

  const report = {
    kind: 'EXP021_POSITION_TIMING_ANALYSIS_V1',
    sourceArtifacts: { rawPath, comparePath },
    compareProviderResult: compare.providerComparisonResult,
    pinRejectedProviderRows: (compare.providerSignalStats as { rejectedProviderRows?: number })?.rejectedProviderRows,
    returnedPositionRowCount: labels.length,
    consecutiveGapCount: gaps.length,
    gapHistogramAmongReturnedRows: gapHist,
    gapPercentAmongReturnedRows: Object.fromEntries(
      Object.entries(gapHist).map(([k, v]) => [k, gaps.length ? (v / gaps.length) * 100 : 0]),
    ),
    gapSecondsStats: {
      median: sortedGaps.length ? percentile(sortedGaps, 50) : null,
      p90: sortedGaps.length ? percentile(sortedGaps, 90) : null,
      p95: sortedGaps.length ? percentile(sortedGaps, 95) : null,
      max: sortedGaps.length ? sortedGaps[sortedGaps.length - 1] : null,
    },
    leadingGapSeconds: leadingGapS,
    trailingGapSeconds: trailingGapS,
    absentSecondsOnFixedGrid: absentSeconds,
    absentRunCount: absentRuns.length,
    longestAbsentRunSeconds: absentRuns.reduce((m, r) => Math.max(m, r.durationSec), 0),
    secondsInAbsentRunsLongerThan10s: secondsInLongAbsentRuns,
    shareOfAbsentSecondsInRunsLongerThan10s: absentSeconds ? secondsInLongAbsentRuns / absentSeconds : null,
    longGapsBetweenReturnedRows: longGaps,
    samplingPatternClass: 'MIXED_LONG_OUTAGES_AND_1S_SPACING_WHEN_PRESENT',
    problemWindowHalfOpen: {
      from: '2026-10-14T14:55:43Z',
      toExclusive: '2026-10-14T15:21:53Z',
      durationSeconds: Math.round((pwTo - pwFrom) / 1000),
      returnedPointCount: problemLabels.length,
      timeline: problemTimeline,
    },
    httpAttemptsNote:
      'Compare JSON records estimatedHttpPostsOnSuccessPath=1; executor retry count not instrumented in artifact.',
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, returnedPositionRowCount: labels.length }, null, 2));
}

main();
