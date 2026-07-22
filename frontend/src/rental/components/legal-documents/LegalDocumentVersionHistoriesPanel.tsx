import { LEGAL_DOCUMENT_TYPE_CONFIGS } from '../../lib/legal-document-types';
import { LEGAL_VERSION_HISTORY_REGION_ID } from './legal-documents-a11y';
import type { LegalDocumentLifecycleDialogState } from '../../lib/legal-document-lifecycle.types';
import type {
  LegalDocumentLifecyclePermissions,
  LegalDocumentWorkflowSettings,
} from '../../lib/legal-document-lifecycle.types';
import type { LegalDocumentDto } from '../../../lib/api';
import { SectionHeader } from '../../../components/patterns';
import { LegalDocumentTypeVersionHistory } from './LegalDocumentTypeVersionHistory';
import { useLanguage } from '../../i18n/LanguageContext';

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
  const { t } = useLanguage();

  return (
    <div className="space-y-8" data-testid="legal-version-histories-panel" id={LEGAL_VERSION_HISTORY_REGION_ID}>
      <SectionHeader
        title={t('legalDocuments.history.title')}
        description={t('legalDocuments.history.description')}
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
