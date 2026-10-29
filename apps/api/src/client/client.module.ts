import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientController } from './client.controller';
import { ProfileController } from './profile.controller';

@Module({
  imports: [AuthModule],
  controllers: [ClientController, ProfileController]
})
export class ClientModule {}
