import { Sparkles } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';

export function CommunicationAiSuggestionButton({
  disabled,
  loading,
  onClick,
}: {
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 px-2 text-[11px]"
      disabled={disabled || loading}
      aria-label={t('communication.aiSuggestion.generate')}
      data-testid="communication-ai-suggestion-trigger"
      onClick={onClick}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">{t('communication.aiSuggestion.label')}</span>
    </Button>
  );
}
