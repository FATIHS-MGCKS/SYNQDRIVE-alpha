import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  NOTIFICATION_ACTIVE_STATUSES,
  NOTIFICATION_DB_INTEGRITY_MIGRATION_ID,
  NOTIFICATION_DB_LIMITS,
  NOTIFICATION_TERMINAL_STATUSES,
} from './notification-db-integrity.constants';
import { ACTIVE_NOTIFICATION_STATUSES } from '../notification.repository';

const BACKEND_ROOT = path.join(__dirname, '../../../..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma/schema.prisma');
const MIGRATION_PATH = path.join(
  BACKEND_ROOT,
  `prisma/migrations/${NOTIFICATION_DB_INTEGRITY_MIGRATION_ID}/migration.sql`,
);
const AUDIT_SQL_PATH = path.join(__dirname, 'notification-integrity-audit.sql');

function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, 'utf8');
}

describe('Notification DB integrity schema (Remediation Prompt 6)', () => {
  it('passes prisma validate', () => {
    const output = execSync('npm run prisma:validate', {
      cwd: BACKEND_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://synqdrive:synqdrive@localhost:5432/synqdrive',
      },
    });
    expect(output).toContain('valid');
  });

  it('defines optimistic locking version on notifications', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model Notification[\s\S]*?version\s+Int/);
    expect(schema).toMatch(/model Notification[\s\S]*?createdAt/);
    expect(schema).toMatch(/model Notification[\s\S]*?updatedAt/);
    expect(schema).toMatch(/model Notification[\s\S]*?resolvedAt/);
  });

  it('scopes all notification child tables by organizationId', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model NotificationOccurrence[\s\S]*?organizationId/);
    expect(schema).toMatch(/model NotificationReceipt[\s\S]*?organizationId/);
    expect(schema).toMatch(/model NotificationDeliveryOutbox[\s\S]*?organizationId/);
  });

  it('keeps cascade FKs from child tables to notifications', () => {
    const schema = readSchema();
    expect(schema).toContain('onDelete: Cascade');
    expect(schema).toMatch(/model NotificationOccurrence[\s\S]*?notification Notification/);
    expect(schema).toMatch(/model NotificationReceipt[\s\S]*?notification Notification/);
    expect(schema).toMatch(/model NotificationDeliveryOutbox[\s\S]*?notification Notification/);
  });

  it('indexes dashboard, count, outbox, and retention lookups', () => {
    const schema = readSchema();
    expect(schema).toContain('@@index([organizationId, createdAt], map: "notifications_org_created_at_idx")');
    expect(schema).toContain('@@index([organizationId, eventType, status], map: "notifications_org_event_type_status_idx")');
    expect(schema).toContain('@@index([organizationId, entityType, entityId, status], map: "notifications_org_entity_status_idx")');
    expect(schema).toContain('@@index([organizationId, occurredAt], map: "notification_occurrences_org_occurred_at_idx")');
    expect(schema).toContain('@@index([organizationId, userId], map: "notification_receipts_org_user_id_idx")');
    expect(schema).toContain('@@index([organizationId, createdAt], map: "notification_delivery_outbox_org_created_at_idx")');
  });

  it('aligns active status constants with repository and migration', () => {
    expect([...NOTIFICATION_ACTIVE_STATUSES].sort()).toEqual([...ACTIVE_NOTIFICATION_STATUSES].sort());
    expect(NOTIFICATION_TERMINAL_STATUSES).toEqual(['RESOLVED', 'ARCHIVED']);
  });

  it('migration repairs data before adding constraints (non-destructive)', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toContain('notification_integrity_repair_log');
    expect(sql).toContain('resolve_duplicate_active_fingerprint');
    expect(sql).toContain('align_organization_id');
    expect(sql).toContain('delete_orphan_occurrence');
    expect(sql).toContain('notifications_active_fingerprint_uidx');
    expect(sql).toContain('notifications_resolved_has_timestamp_check');
    expect(sql).toContain('notifications_template_params_size_check');
    expect(sql).not.toMatch(/DROP TABLE/i);
  });

  it('documents audit queries for duplicates, orphans, and tenant mismatches', () => {
    const auditSql = fs.readFileSync(AUDIT_SQL_PATH, 'utf8');
    expect(auditSql).toContain('Active duplicate fingerprints');
    expect(auditSql).toContain('Orphan notification occurrences');
    expect(auditSql).toContain('Orphan notification receipts');
    expect(auditSql).toContain('Orphan delivery outbox rows');
    expect(auditSql).toContain('Invalid / missing organizations');
    expect(auditSql).toContain('Invalid / blank entity references');
  });

  it('aligns JSON byte limits with constants', () => {
    expect(NOTIFICATION_DB_LIMITS.templateParamsMaxBytes).toBe(32_768);
    expect(NOTIFICATION_DB_LIMITS.actionTargetMaxBytes).toBe(8_192);
    expect(NOTIFICATION_DB_LIMITS.occurrencePayloadMaxBytes).toBe(65_536);
    expect(NOTIFICATION_DB_LIMITS.outboxPayloadRefMaxBytes).toBe(16_384);
  });
});
