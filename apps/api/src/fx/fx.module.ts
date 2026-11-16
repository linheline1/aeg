import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FxController } from './fx.controller';

@Module({
  imports: [AuthModule],
  controllers: [FxController]
})
export class FxModule {}
