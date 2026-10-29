import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminStatsController } from './admin-stats.controller';
import { AiConfigController } from './ai-config.controller';

@Module({
  imports: [AuthModule],
  controllers: [AdminStatsController, AiConfigController]
})
export class AdminStatsModule {}
