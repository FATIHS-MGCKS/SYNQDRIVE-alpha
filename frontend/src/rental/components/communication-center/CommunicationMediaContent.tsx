import { useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { cn } from '../../../components/ui/utils';
import type { TranslationKey } from '../../i18n/translations/en';
import type { CommunicationAttachmentSummary } from '../../../lib/communication/types';
import { communicationClient } from '../../../lib/communication/communication-client';

interface CommunicationMediaContentProps {
  orgId: string;
  contentType: 'IMAGE' | 'DOCUMENT';
  caption?: string | null;
  attachments?: CommunicationAttachmentSummary[];
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CommunicationMediaContent({
  orgId,
  contentType,
  caption,
  attachments = [],
  t,
}: CommunicationMediaContentProps) {
  const attachment = attachments[0];
  const [imageFailed, setImageFailed] = useState(false);

  if (!attachment) {
    return (
      <p className="text-[12px] text-muted-foreground italic">
        {t('communication.attachments.unavailable')}
      </p>
    );
  }

  const contentUrl = communicationClient.attachmentContentUrl(orgId, attachment.id);

  if (contentType === 'IMAGE' && !imageFailed) {
    return (
      <div className="space-y-1">
        <a
          href={contentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-md border border-border/40"
        >
          <img
            src={contentUrl}
            alt={caption?.trim() || t('communication.timeline.image')}
            loading="lazy"
            className="max-h-48 w-full object-contain bg-muted/20"
            onError={() => setImageFailed(true)}
          />
        </a>
        {caption?.trim() ? (
          <p className="whitespace-pre-wrap break-words text-foreground">{caption}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border border-border/40 bg-background/60 px-2 py-1.5',
      )}
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-foreground">{attachment.fileName}</p>
        <p className="text-[11px] text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</p>
      </div>
      <a
        href={contentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] text-[color:var(--brand)] hover:underline"
        aria-label={`${t('communication.attachments.download')} ${attachment.fileName}`}
      >
        <Download className="size-3.5" aria-hidden />
        <span>{contentType === 'DOCUMENT' ? t('communication.attachments.open') : t('communication.attachments.download')}</span>
      </a>
    </div>
  );
}
