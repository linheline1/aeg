import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffController } from './staff.controller';
import { AdminProfileController, OpsProfileController } from './profile.controller';

@Module({
  imports: [AuthModule],
  controllers: [StaffController, OpsProfileController, AdminProfileController]
})
export class StaffModule {}
