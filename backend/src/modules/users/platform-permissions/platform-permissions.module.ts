import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { PlatformPermissionService } from './platform-permission.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [PlatformPermissionService],
  exports: [PlatformPermissionService],
})
export class PlatformPermissionsModule {}