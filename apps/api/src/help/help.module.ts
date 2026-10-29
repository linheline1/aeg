import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminHelpController, ClientHelpController, OpsHelpController } from './help.controller';

@Module({
  imports: [AuthModule],
  controllers: [AdminHelpController, ClientHelpController, OpsHelpController]
})
export class HelpModule {}
