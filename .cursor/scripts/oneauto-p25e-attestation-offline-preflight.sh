#!/usr/bin/env bash
# Offline attestation fixtures only — no production network, no API key required.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT}/backend"
npm run ops:oneauto:sandbox-attestation:offline --silent 2>/dev/null | node -e "
const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
  const arr = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const qualified = arr.filter((e) => e.attestationQualified).length;
  const offline = arr.every((e) => e.attestationEnvironment === 'OFFLINE');
  console.log(
    JSON.stringify(
      {
        fixtureCount: arr.length,
        allOffline: offline,
        qualifiedFixtures: qualified,
        attestationQualifiedOnlyOnSuccessFixture: qualified === 1,
      },
      null,
      2,
    ),
  );
});
"
