import { useLanguage } from '../../../i18n/LanguageContext';
import type { AdminCatalogProductRow } from '../../organizations/product-management.types';
import { MasterPageSection } from '../../shell';

interface ProductCommercialScopePanelProps {
  catalog: AdminCatalogProductRow[];
}

export function ProductCommercialScopePanel({ catalog }: ProductCommercialScopePanelProps) {
  const { t } = useLanguage();
  const slugs = catalog.map((c) => c.slug).join(', ') || '—';

  return (
    <MasterPageSection title={t('master.productCommercial.scope.title')}>
      <ul className="space-y-3 text-sm text-muted-foreground max-w-3xl list-disc pl-5">
        <li>
          <strong className="text-foreground">{t('master.productCommercial.scope.metadata')}</strong>
          {' — '}
          {t('master.productCommercial.scope.metadataBody')}
          <span className="block text-xs font-mono mt-1 text-muted-foreground">{slugs}</span>
        </li>
        <li>
          <strong className="text-foreground">{t('master.productCommercial.scope.pricebooks')}</strong>
          {' — '}
          {t('master.productCommercial.scope.pricebooksBody')}
        </li>
        <li>
          <strong className="text-foreground">{t('master.productCommercial.scope.contracts')}</strong>
          {' — '}
          {t('master.productCommercial.scope.contractsBody')}
        </li>
        <li>
          <strong className="text-foreground">{t('master.productCommercial.scope.discounts')}</strong>
          {' — '}
          {t('master.productCommercial.scope.discountsBody')}
        </li>
      </ul>
    </MasterPageSection>
  );
}