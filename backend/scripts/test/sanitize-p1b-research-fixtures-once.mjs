#!/usr/bin/env node
/**
 * One-off sanitizer: converts legacy P1B research fixtures to synthetic replay data.
 * Run from repo root: node backend/scripts/test/sanitize-p1b-research-fixtures-once.mjs
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

const FIXTURE_DIR = join(
  process.cwd(),
  'backend/src/modules/vehicle-intelligence/battery-health/hv-charging-counter-evidence/fixtures/p1b-research',
);

const CASE_ORDER = [
  '1571cea1',
  '1b0bae62',
  '3e5fe028',
  '46df5cef',
  '57409c99',
  '788919ae',
  '795c7dcb',
  '96d71cde',
  'ad282bd3',
  'b9b092f4',
  'ebdcd41a',
];

const expectations = JSON.parse(
  readFileSync(join(FIXTURE_DIR, 'p1b-research-expectations.v1.json'), 'utf8'),
);

const production = JSON.parse(
  readFileSync(join(FIXTURE_DIR, 'production-sessions.snapshot.json'), 'utf8'),
);

const newExpectations = {};
const newProduction = [];

const SYNTHETIC_BASE_MS = Date.parse('2030-06-01T00:00:00.000Z');

for (let i = 0; i < CASE_ORDER.length; i++) {
  const legacyShort = CASE_ORDER[i];
  const caseId = `case${String(i + 1).padStart(2, '0')}`;
  const sessionId = `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;

  const legacyPath = join(FIXTURE_DIR, `${legacyShort}-dimo-response.json`);
  const art = JSON.parse(readFileSync(legacyPath, 'utf8'));

  const origSessionFrom = Date.parse(art.sessionWindow.from);
  const caseBaseMs = SYNTHETIC_BASE_MS + i * 86_400_000;
  const shiftMs = caseBaseMs - origSessionFrom;

  const shiftIso = (iso) => new Date(Date.parse(iso) + shiftMs).toISOString();

  const rows = art.rows.map((row) => ({
    timestamp: shiftIso(row.timestamp),
    addedKwhLast: row.addedKwhLast ?? null,
    addedKwhMin: row.addedKwhMin ?? null,
    addedKwhMax: row.addedKwhMax ?? null,
  }));

  const sanitized = {
    caseId,
    sessionId,
    sessionWindow: {
      from: shiftIso(art.sessionWindow.from),
      to: shiftIso(art.sessionWindow.to),
    },
    queryWindow: {
      from: shiftIso(art.queryWindow.from),
      to: shiftIso(art.queryWindow.to),
    },
    rows,
  };

  writeFileSync(
    join(FIXTURE_DIR, `${caseId}-dimo-response.json`),
    `${JSON.stringify(sanitized, null, 2)}\n`,
  );

  newExpectations[caseId] = expectations[legacyShort];

  const prod = production.find((row) => row.id.startsWith(legacyShort));
  newProduction.push({
    id: sessionId,
    source: 'DIMO_RECHARGE_SEGMENT',
    isOngoing: false,
    endAt: shiftIso(prod?.endAt ?? art.sessionWindow.to),
    metadata: { qualityStatus: 'PARTIAL' },
  });

  try {
    unlinkSync(legacyPath);
  } catch {
    /* already removed */
  }
}

writeFileSync(
  join(FIXTURE_DIR, 'p1b-research-expectations.v1.json'),
  `${JSON.stringify(newExpectations, null, 2)}\n`,
);

writeFileSync(
  join(FIXTURE_DIR, 'session-authority-fixtures.v1.json'),
  `${JSON.stringify(newProduction, null, 2)}\n`,
);

try {
  unlinkSync(join(FIXTURE_DIR, 'production-sessions.snapshot.json'));
} catch {
  /* noop */
}

console.log(`Sanitized ${CASE_ORDER.length} replay fixtures into case01..case11`);
