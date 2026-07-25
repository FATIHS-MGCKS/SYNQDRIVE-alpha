import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { HandoverKind, OperatorUploadKind } from '@prisma/client';

export class RegisterOperatorUploadDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  clientUploadId!: string;

  @IsEnum(OperatorUploadKind)
  kind!: OperatorUploadKind;

  @IsUUID()
  bookingId!: string;

  @IsUUID()
  vehicleId!: string;

  @IsOptional()
  @IsUUID()
  handoverSessionId?: string | null;

  @IsOptional()
  @IsEnum(HandoverKind)
  handoverKind?: HandoverKind | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  fileName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string | null;

  @IsOptional()
  @IsBoolean()
  requiredForComplete?: boolean;
}
