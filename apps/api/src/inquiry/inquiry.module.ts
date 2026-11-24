import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { InquiryController } from './inquiry.controller';

@Module({ imports: [AuthModule, KnowledgeModule], controllers: [InquiryController] })
export class InquiryModule {}
