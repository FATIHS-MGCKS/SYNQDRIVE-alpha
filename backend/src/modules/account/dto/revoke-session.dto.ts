import { IsOptional, IsString } from 'class-validator';

/** Optional hint when revoking other sessions (newest active session is kept if omitted). */
export class RevokeOtherSessionsDto {
  @IsOptional()
  @IsString()
  keepSessionId?: string;
}
