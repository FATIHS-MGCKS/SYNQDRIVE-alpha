import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PaginationParams } from '@shared/utils/pagination';
import { Prisma } from '@prisma/client';

@Controller('organizations/:orgId/bookings')
@UseGuards(RolesGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get('today/pickups')
  async findTodaysPickups(@Param('orgId') orgId: string) {
    return this.bookingsService.findTodaysPickups(orgId);
  }

  @Get('today/returns')
  async findTodaysReturns(@Param('orgId') orgId: string) {
    return this.bookingsService.findTodaysReturns(orgId);
  }

  @Get('stats')
  async getStats(@Param('orgId') orgId: string) {
    return this.bookingsService.getBookingStats(orgId);
  }

  @Get()
  async findAll(
    @Param('orgId') orgId: string,
    @Query() query: PaginationParams,
  ) {
    return this.bookingsService.findAll(orgId, query);
  }

  @Get(':id')
  async findOne(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.bookingsService.findById(orgId, id);
  }

  @Post()
  async create(
    @Param('orgId') orgId: string,
    @Body() body: Omit<Prisma.BookingCreateInput, 'organization'>,
  ) {
    return this.bookingsService.create(orgId, body);
  }

  @Patch(':id')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: Prisma.BookingUpdateInput,
  ) {
    return this.bookingsService.update(orgId, id, body);
  }

  @Delete(':id')
  async cancel(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.bookingsService.cancel(orgId, id);
  }
}
