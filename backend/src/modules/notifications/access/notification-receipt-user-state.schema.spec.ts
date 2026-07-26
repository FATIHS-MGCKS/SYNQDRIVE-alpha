import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.join(__dirname, '../../../..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma/schema.prisma');
const MIGRATION_PATH = path.join(
  BACKEND_ROOT,
  'prisma/migrations/20260726140000_notification_receipt_user_state/migration.sql',
);

describe('Notification receipt user state schema (Remediation Prompt 10)', () => {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

  it('defines per-user receipt fields and unique notification+user', () => {
    expect(schema).toMatch(/model NotificationReceipt[\s\S]*?readAt/);
    expect(schema).toMatch(/model NotificationReceipt[\s\S]*?acknowledgedAt/);
    expect(schema).toMatch(/model NotificationReceipt[\s\S]*?snoozedUntil/);
    expect(schema).toMatch(/model NotificationReceipt[\s\S]*?hiddenAt/);
    expect(schema).toMatch(/model NotificationReceipt[\s\S]*?lastSeenAt/);
    expect(schema).toContain('@@unique([notificationId, userId])');
  });

  it('migration adds last_seen_at index', () => {
    expect(sql).toContain('last_seen_at');
    expect(sql).toContain('notification_receipts_org_user_last_seen_idx');
  });
});
