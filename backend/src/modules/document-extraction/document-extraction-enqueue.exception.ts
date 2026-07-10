import { ServiceUnavailableException } from '@nestjs/common';
import { PublicDocumentExtractionDto } from './dto/public-document-extraction.dto';

/**
 * Raised when the extraction record was persisted but the BullMQ job could not
 * be enqueued. The response still includes extractionId so the client can retry.
 */
export class DocumentExtractionEnqueueFailedException extends ServiceUnavailableException {
  constructor(
    public readonly extraction: PublicDocumentExtractionDto,
    errorCode: string = 'QUEUE_UNAVAILABLE',
  ) {
    super({
      message: 'Queue derzeit nicht verfügbar — erneut versuchen',
      errorCode,
      extractionId: extraction.id,
      extraction,
    });
  }
}
