import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CustomerDocumentStatus } from '@prisma/client';

export class ReviewCustomerDocumentDto {
  @IsEnum(CustomerDocumentStatus)
  status!: CustomerDocumentStatus;

  @ValidateIf((o: ReviewCustomerDocumentDto) => o.status === 'REJECTED')
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  rejectedReason?: string;
}
