#!/usr/bin/env node
'use strict';

const fs = require('fs');

const path = process.argv[2];
if (!path) {
  console.error('FAIL_CLOSED: validate-npm-audit-json missing file path');
  process.exit(2);
}

if (!fs.existsSync(path)) {
  console.error(`FAIL_CLOSED: audit JSON file missing: ${path}`);
  process.exit(2);
}

const raw = fs.readFileSync(path, 'utf8').trim();
if (!raw) {
  console.error(`FAIL_CLOSED: empty audit JSON: ${path}`);
  process.exit(2);
}

try {
  const parsed = JSON.parse(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error(`FAIL_CLOSED: audit JSON root must be an object: ${path}`);
    process.exit(2);
  }
} catch (err) {
  console.error(`FAIL_CLOSED: malformed audit JSON (${path}): ${err.message}`);
  process.exit(2);
}

process.exit(0);
