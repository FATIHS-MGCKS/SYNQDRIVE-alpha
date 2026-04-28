import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { HighMobilityCompatibilityService } from './hm-compatibility.service';
import type {
  CompatibilityBrandOption,
  CompatibilityCheckResponse,
  CompatibilityModelOption,
} from './hm-compatibility.types';

/**
 * Master-Admin endpoints for the internal High Mobility Compatibility Check
 * page. Surface is intentionally small and shaped for the UI (no raw DB rows).
 * These endpoints are designed to be reusable later by the landing-page
 * compatibility checker and onboarding flow.
 */
@Controller('admin/high-mobility/compatibility')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class HighMobilityCompatibilityController {
  constructor(
    private readonly compatibilityService: HighMobilityCompatibilityService,
  ) {}

  /** GET /api/v1/admin/high-mobility/compatibility/brands */
  @Get('brands')
  async getBrands(): Promise<{ brands: CompatibilityBrandOption[] }> {
    const brands = await this.compatibilityService.listBrands();
    return { brands };
  }

  /** GET /api/v1/admin/high-mobility/compatibility/models?brand=volkswagen */
  @Get('models')
  async getModels(
    @Query('brand') brand?: string,
  ): Promise<{ models: CompatibilityModelOption[] }> {
    if (!brand || !brand.trim()) {
      throw new BadRequestException('Query parameter "brand" is required');
    }
    const models = await this.compatibilityService.listModels(brand.trim());
    return { models };
  }

  /**
   * GET /api/v1/admin/high-mobility/compatibility/check
   *   ?brand=Volkswagen&model=Golf&year=2020
   */
  @Get('check')
  async check(
    @Query('brand') brand?: string,
    @Query('model') model?: string,
    @Query('year') yearRaw?: string,
  ): Promise<CompatibilityCheckResponse> {
    if (!brand || !brand.trim()) {
      throw new BadRequestException('Query parameter "brand" is required');
    }
    if (!model || !model.trim()) {
      throw new BadRequestException('Query parameter "model" is required');
    }

    let year: number | null = null;
    if (yearRaw != null && yearRaw !== '') {
      const parsed = Number.parseInt(yearRaw, 10);
      if (!Number.isFinite(parsed) || parsed < 1900 || parsed > 2100) {
        throw new BadRequestException(
          'Query parameter "year" must be a valid 4-digit year',
        );
      }
      year = parsed;
    }

    return this.compatibilityService.check(brand.trim(), model.trim(), year);
  }
}
