import { Module } from '@nestjs/common';
import { VersionController } from './version.controller';

/** 版本信息：公开读取各端构建版本（/api/version） */
@Module({
  controllers: [VersionController]
})
export class VersionModule {}
