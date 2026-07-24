import type { EvaluationsDataQualityNavigationOptions } from '../lib/evaluations-data-quality-navigation';
import { EvaluationsPage } from './EvaluationsPage';

interface FinancialInsightsViewProps {
  isDarkMode: boolean;
  onNavigate?: (view: string, options?: EvaluationsDataQualityNavigationOptions) => void;
}

/**
 * Auswertungen — thin entry wrapper (Prompt 30/54).
 * Composes section-based {@link EvaluationsPage} IA instead of monolithic layout.
 */
export function FinancialInsightsView({ isDarkMode, onNavigate }: FinancialInsightsViewProps) {
  return <EvaluationsPage isDarkMode={isDarkMode} onNavigate={onNavigate} />;
}
