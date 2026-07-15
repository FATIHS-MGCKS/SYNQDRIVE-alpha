import { IsIn, IsOptional } from 'class-validator';

export class SyncStripeCatalogDto {
  @IsOptional()
  @IsIn(['TEST', 'LIVE'])
  stripeMode?: 'TEST' | 'LIVE';
}
