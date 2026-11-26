#!/usr/bin/env node
/**
 * Fail-closed IAM schema preflight for USR-P2 disposable PostgreSQL gates.
 */
import { PrismaClient } from '@prisma/client';

const REQUIRED = [
  {
    table: 'users',
    columns: [
      'password_hash',
      'first_name',
      'last_name',
      'must_change_password',
      'session_version',
      'security_version',
    ],
  },
  {
    table: 'organization_memberships',
    columns: ['role_label', 'membership_version', 'field_agent_access', 'permissions'],
  },
  {
    table: 'refresh_tokens',
    columns: ['organization_id', 'family', 'privileged_session'],
  },
  {
    table: 'iam_session_revocation_intents',
    columns: ['idempotency_key', 'scope', 'status'],
  },
  {
    table: 'user_mfa_factors',
    columns: ['user_id', 'factor_type'],
  },
  {
    table: 'user_mfa_recovery_codes',
    columns: ['user_id', 'code_hash'],
  },
  {
    table: 'password_reset_tokens',
    columns: ['user_id', 'token_hash'],
  },
  {
    table: 'master_admin_audit_outbox',
    columns: ['idempotency_key', 'payload'],
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url) || !/usr_p2_/i.test(url)) {
    console.error('USR_P2_IAM_PREFLIGHT_FAIL: DATABASE_URL must be disposable usr_p2_* on loopback');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const missing = [];

  try {
    for (const { table, columns } of REQUIRED) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        table,
      );
      const present = new Set(rows.map((r) => r.column_name));
      for (const col of columns) {
        if (!present.has(col)) {
          missing.push(`${table}.${col}`);
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  if (missing.length > 0) {
    console.error('USR_P2_IAM_PREFLIGHT_FAIL: missing columns:', missing.join(', '));
    process.exit(1);
  }

  console.log('USR_P2_IAM_PREFLIGHT_PASS');
}

main().catch((err) => {
  console.error('USR_P2_IAM_PREFLIGHT_FAIL:', err.message);
  process.exit(1);
});