import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { REQUEST_DOCUMENT_TYPES } from '../document-extraction.schemas';

/** Multipart form fields accompanying the uploaded `file`. */
export class UploadDocumentDto {
  @IsString()
  @IsIn(REQUEST_DOCUMENT_TYPES as unknown as string[])
  documentType!: string;

  /** Optional source context (e.g. 'rental_ui'); not trusted for any logic. */
  @IsOptional()
  @IsString()
  source?: string;

  /** Accepted but ignored — org is always derived from the vehicle server-side. */
  @IsOptional()
  @IsString()
  organizationId?: string;

  /** Required to authorize re-upload of an org-scoped exact duplicate (min 3 chars). */
  @IsOptional()
  @IsString()
  @MinLength(3)
  reuploadReason?: string;

  /** Optional link to the existing extraction being re-uploaded. */
  @IsOptional()
  @IsString()
  relatedExtractionId?: string;

  /** Optional invoice number hint for org-scoped business duplicate detection. */
  @IsOptional()
  @IsString()
  invoiceNumberHint?: string;

  /** Optional case/reference number hint (Aktenzeichen) for business duplicate detection. */
  @IsOptional()
  @IsString()
  referenceNumberHint?: string;
}
