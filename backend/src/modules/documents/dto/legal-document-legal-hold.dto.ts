import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetLegalDocumentLegalHoldDto {
  @IsString()
  @MaxLength(2000)
  reason!: string;
}

export class ClearLegalDocumentLegalHoldDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
