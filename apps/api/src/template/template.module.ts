import { Module } from '@nestjs/common';
import { AdminTemplateController } from './admin-template.controller';
import { ClientTemplateController } from './client-template.controller';
import { TemplateService } from './template.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AuditModule],
  providers: [TemplateService],
  controllers: [AdminTemplateController, ClientTemplateController],
  exports: [TemplateService]
})
export class TemplateModule {}
