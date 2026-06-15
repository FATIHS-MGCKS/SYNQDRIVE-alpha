import { IsEnum } from 'class-validator';
import { CustomerDocumentType } from '@prisma/client';

export class UploadCustomerDocumentDto {
  @IsEnum(CustomerDocumentType)
  type!: CustomerDocumentType;
}
