import { Module } from '@nestjs/common';
import { VersionController } from './version.controller';
import { ReadinessController } from './readiness.controller';
import { AuthModule } from '../auth/auth.module';

/** 版本信息：公开读取各端构建版本（/api/version） */
@Module({
  imports: [AuthModule],
  controllers: [VersionController, ReadinessController]
})
export class VersionModule {}
