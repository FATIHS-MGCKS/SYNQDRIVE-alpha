import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { PrismaModule } from '@shared/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
})
export class AuthApiModule {}
