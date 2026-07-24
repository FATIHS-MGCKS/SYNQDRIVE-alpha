import type { DataProcessingDetailTarget } from '../../../../lib/data-processing-detail.types';
import { DataAuthorizationDetailDrawer } from '../../data-authorization/DataAuthorizationDetailDrawer';
import type { DataAuthorizationDto } from '../../../../../lib/api';
import { DpaDetailDrawer } from './DpaDetailDrawer';
import { EntityDetailDrawer } from './EntityDetailDrawer';
import { ProcessingActivityDetailDrawer } from './ProcessingActivityDetailDrawer';

interface Props {
  target: DataProcessingDetailTarget | null;
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage?: boolean;
  onUpdated?: () => void;
  legacyAuth?: DataAuthorizationDto | null;
  legacyActionLoading?: boolean;
  onLegacyGrant?: () => void;
  onLegacyRevoke?: () => void;
  onNavigate?: (target: DataProcessingDetailTarget) => void;
}

export function DataProcessingDetailHost({
  target,
  orgId,
  open,
  onOpenChange,
  canManage,
  onUpdated,
  legacyAuth,
  legacyActionLoading,
  onLegacyGrant,
  onLegacyRevoke,
  onNavigate,
}: Props) {
  if (!target) return null;

  if (target.kind === 'processing-activity') {
    return (
      <ProcessingActivityDetailDrawer
        activityId={target.id}
        orgId={orgId}
        open={open}
        onOpenChange={onOpenChange}
        canManage={canManage}
        onUpdated={onUpdated}
        onNavigate={(t) => onNavigate?.({ kind: t.kind as DataProcessingDetailTarget['kind'], id: t.id, activityId: t.activityId })}
      />
    );
  }

  if (target.kind === 'dpa') {
    return (
      <DpaDetailDrawer
        dpaId={target.id}
        orgId={orgId}
        open={open}
        onOpenChange={onOpenChange}
        canManage={canManage}
        onUpdated={onUpdated}
        onNavigate={(t) => onNavigate?.({ kind: t.kind as DataProcessingDetailTarget['kind'], id: t.id })}
      />
    );
  }

  if (target.kind === 'legacy-authorization' && legacyAuth) {
    return (
      <DataAuthorizationDetailDrawer
        auth={legacyAuth}
        orgId={orgId}
        open={open}
        onOpenChange={onOpenChange}
        canManage={Boolean(canManage)}
        actionLoading={Boolean(legacyActionLoading)}
        onGrant={() => onLegacyGrant?.()}
        onRevoke={() => onLegacyRevoke?.()}
      />
    );
  }

  return (
    <EntityDetailDrawer
      target={target}
      orgId={orgId}
      open={open}
      onOpenChange={onOpenChange}
      canManage={canManage}
      onUpdated={onUpdated}
      onNavigate={onNavigate}
    />
  );
}
