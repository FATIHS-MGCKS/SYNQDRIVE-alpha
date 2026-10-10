#!/usr/bin/env ts-node
import { finalizeTrustedDispatchIssuanceSpendForLiveOpen } from './di-v0-s4-gate6-trusted-dispatch-issuance.lib';

const nonce = process.argv[2] ?? '';
const result = finalizeTrustedDispatchIssuanceSpendForLiveOpen(process.env, nonce);
if (result.ok) {
  console.log('ISSUANCE_SPEND_OK=YES');
  process.exit(0);
}
console.log(`ISSUANCE_SPEND_FAILURE=${result.failure}`);
process.exit(1);
