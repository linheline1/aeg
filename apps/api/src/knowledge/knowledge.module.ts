import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeAdminController } from './knowledge-admin.controller';

@Module({
  imports: [AuthModule],
  controllers: [KnowledgeAdminController],
  providers: [KnowledgeService],
  exports: [KnowledgeService]
})
export class KnowledgeModule {}
