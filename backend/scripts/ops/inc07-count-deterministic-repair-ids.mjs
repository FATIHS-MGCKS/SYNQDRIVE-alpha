#!/usr/bin/env node
/**
 * Read tab-separated trip_repairs rows from stdin and print deterministic INC-07 ID count.
 *
 * Input columns: id, vehicle_id, window_from_iso, window_to_iso
 * (window columns must be UTC ISO with milliseconds, e.g. from psql to_char AT TIME ZONE 'UTC')
 */
import { createInterface } from 'node:readline';
import { countDeterministicIntraTripGapSplitRepairIds } from './inc07-deterministic-repair-id-detector.mjs';

const rows = [];
const rl = createInterface({ input: process.stdin });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  const [id, vehicle_id, window_from, window_to] = trimmed.split('\t');
  if (!id || !vehicle_id || !window_from || !window_to) return;
  rows.push({ id, vehicle_id, window_from, window_to });
});

rl.on('close', () => {
  console.log(countDeterministicIntraTripGapSplitRepairIds(rows));
});
