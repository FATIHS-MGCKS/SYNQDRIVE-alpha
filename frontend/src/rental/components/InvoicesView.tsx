import { InvoicesPage } from './invoices/InvoicesPage';

interface InvoicesViewProps {
  isDarkMode: boolean;
}

/** @deprecated Prefer importing `InvoicesPage` from `./invoices/InvoicesPage`. */
export function InvoicesView({ isDarkMode }: InvoicesViewProps) {
  return <InvoicesPage isDarkMode={isDarkMode} />;
}

export { InvoicesPage } from './invoices/InvoicesPage';
