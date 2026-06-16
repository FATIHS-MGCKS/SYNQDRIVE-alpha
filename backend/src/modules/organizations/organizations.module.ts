import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { TenantOrganizationProfileController } from './tenant-organization-profile.controller';
import { OrganizationsService } from './organizations.service';
import { UsersModule } from '@modules/users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [OrganizationsController, TenantOrganizationProfileController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
