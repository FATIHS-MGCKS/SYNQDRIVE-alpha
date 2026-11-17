import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CoreAppM2mSkipUserJwt } from '../core-app-m2m-skip-user-jwt.decorator';
import { CoreAppM2mJwtAuthGuard } from '../core-app-m2m-jwt-auth.guard';
import type { CoreAppM2mAuthorizedResourceContext } from '../core-app-m2m-resource-authorization.service';
import { CORE_APP_M2M_REQUEST_AUTH_KEY } from '../core-app-m2m-verified-token.types';
import { parseCoreReadPagination } from './core-read-pagination.util';
import { CoreReadVehiclesService } from './core-read-vehicles.service';

type CoreAppM2mAuthedRequest = Request & {
  [CORE_APP_M2M_REQUEST_AUTH_KEY]?: CoreAppM2mAuthorizedResourceContext;
};

@CoreAppM2mSkipUserJwt()
@UseGuards(CoreAppM2mJwtAuthGuard)
@Controller('core/read/v1')
export class CoreReadVehiclesController {
  constructor(private readonly vehicles: CoreReadVehiclesService) {}

  @Get('organizations/:orgId/vehicles')
  listVehicles(
    @Req() req: CoreAppM2mAuthedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const auth = req[CORE_APP_M2M_REQUEST_AUTH_KEY]!;
    const pagination = parseCoreReadPagination(page, pageSize);
    return this.vehicles.listVehicles(auth, pagination.page, pagination.pageSize);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId')
  getVehicle(@Req() req: CoreAppM2mAuthedRequest, @Param('vehicleId') vehicleId: string) {
    const auth = req[CORE_APP_M2M_REQUEST_AUTH_KEY]!;
    return this.vehicles.getVehicle(auth, vehicleId);
  }
}