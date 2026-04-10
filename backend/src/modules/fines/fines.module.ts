import { Module } from '@nestjs/common';
import { FinesController } from './fines.controller';
import { FinesService } from './fines.service';
import { TasksModule } from '@modules/tasks/tasks.module';

@Module({
  imports: [TasksModule],
  controllers: [FinesController],
  providers: [FinesService],
  exports: [FinesService],
})
export class FinesModule {}
