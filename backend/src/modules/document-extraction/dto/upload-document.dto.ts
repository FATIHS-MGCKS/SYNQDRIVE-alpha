import { IsIn, IsOptional, IsString } from 'class-validator';
import { SUPPORTED_DOCUMENT_TYPES } from '../document-extraction.schemas';

/** Multipart form fields accompanying the uploaded `file`. */
export class UploadDocumentDto {
  @IsString()
  @IsIn(SUPPORTED_DOCUMENT_TYPES as unknown as string[])
  documentType!: string;

  /** Optional source context (e.g. 'rental_ui'); not trusted for any logic. */
  @IsOptional()
  @IsString()
  source?: string;

  /** Accepted but ignored — org is always derived from the vehicle server-side. */
  @IsOptional()
  @IsString()
  organizationId?: string;
}
