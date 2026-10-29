import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import { TemplateService } from './template.service';
import { AuditService } from '../audit/audit.service';

@Controller('admin/templates')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminTemplateController {
  constructor(
    private readonly service: TemplateService,
    private readonly audit: AuditService
  ) {}

  @Get()
  async list() {
    const list: any[] = await this.service.list();
    return list.map((v: any) => ({
      id: v.id,
      template_code: v.template_code,
      version_no: v.version_no,
      status: v.status,
      activated_at: v.activated_at,
      created_at: v.created_at
    }));
  }

  @Get(':version')
  async get(@Param('version') version: string) {
    const v = await this.service.getByVersion(version);
    return {
      id: v.id,
      version_no: v.version_no,
      template_code: v.template_code,
      status: v.status,
      meta: v.meta_json,
      schema: v.schema_json
    };
  }
}
