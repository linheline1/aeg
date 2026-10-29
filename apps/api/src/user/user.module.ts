import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UserService } from './user.service';

@Module({
  imports: [AuthModule],
  providers: [UserService],
  exports: [UserService]
})
export class UserModule {}
