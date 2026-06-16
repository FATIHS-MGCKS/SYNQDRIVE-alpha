import { StatusChip } from '../../../components/patterns';
import type { OrgUserDto } from '../../../lib/api';
import type { OrganizationInviteStatus } from './types';

export function UserStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  if (normalized === 'active' || status === 'Active') {
    return <StatusChip tone="success">Aktiv</StatusChip>;
  }
  if (normalized === 'invited' || status === 'Invited') {
    return <StatusChip tone="warning">Eingeladen</StatusChip>;
  }
  if (normalized === 'inactive' || status === 'Inactive' || status === 'Suspended') {
    return <StatusChip tone="neutral">Deaktiviert</StatusChip>;
  }
  if (status === 'Removed' || status === 'REMOVED') {
    return <StatusChip tone="critical">Entfernt</StatusChip>;
  }
  return <StatusChip tone="neutral">{status || 'Unbekannt'}</StatusChip>;
}

export function InviteStatusBadge({ status }: { status: OrganizationInviteStatus }) {
  switch (status) {
    case 'PENDING':
      return <StatusChip tone="warning">Ausstehend</StatusChip>;
    case 'ACCEPTED':
      return <StatusChip tone="success">Angenommen</StatusChip>;
    case 'EXPIRED':
      return <StatusChip tone="critical">Abgelaufen</StatusChip>;
    case 'REVOKED':
      return <StatusChip tone="neutral">Widerrufen</StatusChip>;
    default:
      return <StatusChip tone="neutral">{status}</StatusChip>;
  }
}

export function RoleTemplateBadge({ isSystem }: { isSystem: boolean }) {
  if (!isSystem) return null;
  return <StatusChip tone="info">Systemvorlage</StatusChip>;
}

export function ScopeBadge({ user }: { user: OrgUserDto }) {
  const scoped =
    Boolean(user.stationScope?.trim()) || (user.stationIds?.length ?? 0) > 0;
  if (!scoped) return null;
  return <StatusChip tone="warning">Eingeschränkt</StatusChip>;
}

export function AdminBadge({ user }: { user: OrgUserDto }) {
  if (user.roleKey !== 'ORG_ADMIN') return null;
  return <StatusChip tone="info">Organisations-Admin</StatusChip>;
}
