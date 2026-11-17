import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  CORE_APP_M2M_TOKEN_MAX_CLIENT_ID_LENGTH,
  CORE_APP_M2M_TOKEN_MAX_SCOPES,
  CORE_APP_M2M_TOKEN_MAX_SECRET_LENGTH,
} from '../core-app-m2m-jwt.config';

export class CoreAppM2mTokenExchangeRequestDto {
  @IsString()
  @MaxLength(CORE_APP_M2M_TOKEN_MAX_CLIENT_ID_LENGTH)
  clientId!: string;

  @IsString()
  @MaxLength(CORE_APP_M2M_TOKEN_MAX_SECRET_LENGTH)
  clientSecret!: string;

  @IsUUID()
  organizationId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CORE_APP_M2M_TOKEN_MAX_SCOPES)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  scopes!: string[];
}