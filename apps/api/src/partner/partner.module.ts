import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminPartnerController } from './admin-partner.controller';
import { PartnerPublicController } from './partner-public.controller';

/** 合作伙伴：管理端维护（admin），官网公开读取（/api/partners） */
@Module({
  imports: [AuthModule],
  controllers: [AdminPartnerController, PartnerPublicController]
})
export class PartnerModule {}
