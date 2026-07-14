import { InvoicesPage } from './invoices/InvoicesPage';
import type { InvoiceRelationNavigation } from './invoices/InvoiceRelations';

interface InvoicesViewProps {
  isDarkMode: boolean;
  navigation?: InvoiceRelationNavigation;
}

/** @deprecated Prefer importing `InvoicesPage` from `./invoices/InvoicesPage`. */
export function InvoicesView({ isDarkMode, navigation }: InvoicesViewProps) {
  return <InvoicesPage isDarkMode={isDarkMode} navigation={navigation} />;
}

export { InvoicesPage } from './invoices/InvoicesPage';
