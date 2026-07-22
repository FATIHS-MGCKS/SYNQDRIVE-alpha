import { LEGAL_DOCUMENT_TYPE_CONFIGS } from '../../lib/legal-document-types';
import type { LegalDocumentLifecycleDialogState } from '../../lib/legal-document-lifecycle.types';
import type {
  LegalDocumentLifecyclePermissions,
  LegalDocumentWorkflowSettings,
} from '../../lib/legal-document-lifecycle.types';
import type { LegalDocumentDto } from '../../../lib/api';
import { SectionHeader } from '../../../components/patterns';
import { LegalDocumentTypeVersionHistory } from './LegalDocumentTypeVersionHistory';

interface Props {
  orgId: string;
  permissions: LegalDocumentLifecyclePermissions;
  settings: LegalDocumentWorkflowSettings;
  onOpenDetail: (document: LegalDocumentDto) => void;
  onOpenAction: (state: LegalDocumentLifecycleDialogState) => void;
  focusCategoryKey?: string | null;
}

export function LegalDocumentVersionHistoriesPanel({
  orgId,
  permissions,
  settings,
  onOpenDetail,
  onOpenAction,
  focusCategoryKey,
}: Props) {
  return (
    <div className="space-y-8" data-testid="legal-version-histories-panel">
      <SectionHeader
        title="Versionshistorie"
        description="Serverseitig paginierte Historie je Rechtstexttyp mit Filtern und Detailansicht"
        as="label"
      />
      {LEGAL_DOCUMENT_TYPE_CONFIGS.map((config) => (
        <LegalDocumentTypeVersionHistory
          key={config.key}
          orgId={orgId}
          config={config}
          permissions={permissions}
          settings={settings}
          onOpenDetail={onOpenDetail}
          onOpenAction={onOpenAction}
          defaultExpanded={!focusCategoryKey || focusCategoryKey === config.key}
        />
      ))}
    </div>
  );
}
