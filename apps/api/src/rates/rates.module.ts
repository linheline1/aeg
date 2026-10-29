import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RatesController } from './rates.controller';

@Module({
  imports: [AuthModule],
  controllers: [RatesController]
})
export class RatesModule {}
