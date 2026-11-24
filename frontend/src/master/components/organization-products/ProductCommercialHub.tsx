import { ArrowRight } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { MasterBillingSection } from '../billing/master-billing-navigation';
import { MasterPageSection } from '../../shell';

const PRODUCT_KEYS = ['RENTAL', 'FLEET', 'VYMOD'] as const;

export interface ProductCommercialHubProps {
  selectedOrgId: string | null;
  onOpenBilling: (input: {
    section: MasterBillingSection;
    subTab?: string | null;
    orgId?: string | null;
    pricingProductKey?: string | null;
  }) => void;
}

export function ProductCommercialHub({ selectedOrgId, onOpenBilling }: ProductCommercialHubProps) {
  const { t } = useLanguage();

  const platformLinks: Array<{
    labelKey: string;
    section: MasterBillingSection;
    subTab?: string | null;
  }> = [
    { labelKey: 'master.productCommercial.hub.pricingProducts', section: 'pricing', subTab: 'products' },
    { labelKey: 'master.productCommercial.hub.pricingVersions', section: 'pricing', subTab: 'versions' },
    { labelKey: 'master.productCommercial.hub.contracts', section: 'subscriptions' },
    {
      labelKey: 'master.productCommercial.hub.creditNotes',
      section: 'invoices',
      subTab: 'credit-notes',
    },
  ];

  return (
    <MasterPageSection title={t('master.productCommercial.hub.title')}>
      <p className="text-sm text-muted-foreground max-w-3xl mb-4">
        {t('master.productCommercial.hub.description')}
      </p>

      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        {t('master.productCommercial.hub.byProduct')}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-6 max-w-3xl">
        {PRODUCT_KEYS.map((productKey) => (
          <Button
            key={productKey}
            type="button"
            variant="secondary"
            className="justify-between h-auto py-3 px-4 text-left"
            onClick={() =>
              onOpenBilling({
                section: 'pricing',
                subTab: 'versions',
                pricingProductKey: productKey,
              })
            }
          >
            <span className="text-sm font-medium">
              {productKey === 'RENTAL'
                ? t('master.productCommercial.hub.product.RENTAL')
                : productKey === 'FLEET'
                  ? t('master.productCommercial.hub.product.FLEET')
                  : t('master.productCommercial.hub.product.VYMOD')}
            </span>
            <ArrowRight className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
          </Button>
        ))}
      </div>

      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        {t('master.productCommercial.hub.platformBilling')}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl">
        {platformLinks.map((link) => (
          <Button
            key={link.labelKey}
            type="button"
            variant="outline"
            className="justify-between h-auto py-3 px-4 text-left"
            onClick={() =>
              onOpenBilling({
                section: link.section,
                subTab: link.subTab,
                orgId: null,
              })
            }
          >
            <span className="text-sm font-medium">
              {t(link.labelKey as 'master.productCommercial.hub.pricingProducts')}
            </span>
            <ArrowRight className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
          </Button>
        ))}
        {selectedOrgId ? (
          <Button
            type="button"
            className="justify-between h-auto py-3 px-4 text-left sm:col-span-2"
            onClick={() =>
              onOpenBilling({
                section: 'subscriptions',
                orgId: selectedOrgId,
              })
            }
          >
            <span className="text-sm font-medium">{t('master.productCommercial.hub.openOrgContracts')}</span>
            <ArrowRight className="w-4 h-4 shrink-0 opacity-70" aria-hidden />
          </Button>
        ) : null}
      </div>
    </MasterPageSection>
  );
}