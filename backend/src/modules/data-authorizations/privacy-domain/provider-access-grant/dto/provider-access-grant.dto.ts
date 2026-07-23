import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ProviderAccessGrantMechanism } from '@prisma/client';

export class CreateProviderAccessGrantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  provider!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerAccountReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerGrantReference?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  grantedScopes!: string[];

  @IsOptional()
  @IsEnum(ProviderAccessGrantMechanism)
  grantMechanism?: ProviderAccessGrantMechanism;

  @IsOptional()
  @IsUUID('4')
  processingActivityId?: string;

  @IsOptional()
  @IsUUID('4')
  vehicleId?: string;

  @IsOptional()
  @IsUUID('4')
  legacyVehicleProviderConsentId?: string;
}

export class ActivateProviderAccessGrantDto {
  @IsOptional()
  @IsUUID('4')
  technicalOwnerUserId?: string;
}

export class RevokeProviderAccessGrantDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
