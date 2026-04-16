import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  UsersService,
  CreateOrgUserDto,
  UpdateOrgUserDto,
} from './users.service';
import { PrismaService } from '@shared/database/prisma.service';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';

@Controller()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Master Admin routes ─────────────────────────────

  @Get('admin/users')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async adminFindAll() {
    return this.usersService.findAll();
  }

  @Get('admin/users/:id')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async adminFindOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post('admin/users')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async adminCreate(
    @Body() body: { email: string; name?: string; [key: string]: unknown },
  ) {
    return this.usersService.create(body);
  }

  @Patch('admin/users/:id')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async adminUpdate(
    @Param('id') id: string,
    @Body() body: { email?: string; name?: string; [key: string]: unknown },
  ) {
    return this.usersService.update(id, body);
  }

  @Post('admin/users/:id/change-password')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async adminChangePassword(
    @Param('id') id: string,
    @Body() body: { password: string },
  ) {
    if (!body.password || body.password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }
    const hash = await bcrypt.hash(body.password, 10);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: hash },
    });
    return { message: 'Password updated successfully' };
  }

  @Delete('admin/users/:id')
  @UseGuards(RolesGuard)
  @Roles('MASTER_ADMIN')
  async adminDelete(@Param('id') id: string) {
    return this.usersService.delete(id);
  }

  // ─── Org-scoped routes ───────────────────────────────

  @Get('organizations/:orgId/users')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgFindAll(@Param('orgId') orgId: string) {
    return this.usersService.findByOrganization(orgId);
  }

  @Get('organizations/:orgId/users/:id')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgFindOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.usersService.findOrgUserDetail(orgId, id);
  }

  @Post('organizations/:orgId/users')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgCreate(
    @Param('orgId') orgId: string,
    @Body() body: CreateOrgUserDto,
  ) {
    return this.usersService.createOrgUser(orgId, body);
  }

  @Patch('organizations/:orgId/users/:id')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgUpdate(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: UpdateOrgUserDto,
  ) {
    return this.usersService.updateOrgUser(orgId, id, body);
  }

  @Post('organizations/:orgId/users/:userId/change-password')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async orgChangePassword(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Req() req: { user?: { id?: string } },
    @Body() body: { password: string },
  ) {
    const requesterId = req.user?.id || userId;
    return this.usersService.changeOrgUserPassword(
      orgId,
      userId,
      body.password,
      requesterId,
    );
  }

  @Delete('organizations/:orgId/users/:id')
  @UseGuards(RolesGuard)
  async orgDelete(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.usersService.removeOrgUser(orgId, id);
  }

  @Post('organizations/:orgId/users/:userId/membership')
  @UseGuards(RolesGuard)
  async orgCreateMembership(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body() body: { role: string },
  ) {
    return this.usersService.createMembership(userId, orgId, body.role);
  }
}
