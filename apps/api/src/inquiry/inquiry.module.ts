import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InquiryController } from './inquiry.controller';

@Module({ imports: [AuthModule], controllers: [InquiryController] })
export class InquiryModule {}
