#!/usr/bin/env ts-node
import { reserveApprovalIdForDispatch } from './di-v0-s4-gate6-approval-consumption.lib';

const registerDir = process.argv[2] ?? '';
const approvalId = process.argv[3] ?? '';
const result = reserveApprovalIdForDispatch(registerDir, approvalId);
if (result.ok) {
  console.log('RESERVE_OK=YES');
  process.exit(0);
}
console.log(`RESERVE_FAILURE=${result.failure}`);
process.exit(1);
