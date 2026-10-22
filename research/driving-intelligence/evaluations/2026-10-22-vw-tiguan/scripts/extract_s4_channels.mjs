#!/usr/bin/env node
/**
 * One-off helper: parse frozen S4 evidence container into JSON channel extracts.
 * Requires repo backend deps (run from backend/: npx tsx ../.../extract_s4_channels.mjs)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDiV0S4EvidenceContainer } from '../../../../backend/src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-evidence-container-parse.ts';
import { parseDiV0R1ObdSnapshot } from '../../../../backend/src/modules/vehicle-intelligence/driving-intelligence/r1-obd-acquisition/di-v0-r1-obd-snapshot-parse.ts';

const evalRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const snap = join(evalRoot, 'snapshots');
const container = readFileSync(join(snap, 'di_v0_s4_evidence_container.bin'), 'utf8');
const parsed = parseDiV0S4EvidenceContainer(container);
writeFileSync(join(snap, 's4_evidence_channel_manifest.json'), JSON.stringify(parsed.channelManifest, null, 2));
const r1 = parseDiV0R1ObdSnapshot(parsed.channelPayloads.R1_OBD!);
writeFileSync(join(snap, 'r1_obd_evidence_snapshot.json'), JSON.stringify(r1, null, 2));
console.log('r1 buckets', r1.buckets.length);
