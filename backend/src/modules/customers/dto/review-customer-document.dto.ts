import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const REVIEWABLE_DOCUMENT_STATUSES = ['VERIFIED', 'REJECTED'] as const;

export class ReviewCustomerDocumentDto {
  @IsIn(REVIEWABLE_DOCUMENT_STATUSES)
  status!: (typeof REVIEWABLE_DOCUMENT_STATUSES)[number];

  @ValidateIf((o: ReviewCustomerDocumentDto) => o.status === 'REJECTED')
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  rejectedReason?: string;
}
