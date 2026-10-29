import {
  Controller,
  Get,
  Param,
  Res,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import { TemplateService } from './template.service';
import { AuditService } from '../audit/audit.service';
import { FIELD_DICTIONARY, TEMPLATE_MAX_ROWS, DATA_START_ROW } from '../../../../packages/shared-types/dist/index.js';
import { repoRoot } from '../common/mock-db';
import { existsSync } from 'fs';
import { join } from 'path';

@Controller('client/template')
@UseGuards(AuthGuard, RolesGuard)
@Roles('client', 'admin', 'operator', 'sales') // 客户端与内部人员均可下载模板
export class ClientTemplateController {
  constructor(
    private readonly service: TemplateService,
    private readonly audit: AuditService
  ) {}

  /** 当前启用版本的元信息（客户端工作台模板卡片） */
  @Get('current')
  async current() {
    const v: any = await this.service.getActive();
    if (!v) throw new NotFoundException('当前没有启用的模板版本');
    const updated_at = typeof v.activated_at === 'string'
      ? v.activated_at
      : (v.activated_at?.toISOString?.() || v.created_at);
    return {
      version_no: v.version_no,
      template_code: v.template_code,
      updated_at,
      download_url: `/api/client/template/${v.version_no}/download`,
      description:
        '请按模板填写装箱清单。公式列（J/M/N/R/S/U）请勿修改；入仓号（B2）选填；每行一个 SKU；模板保护已锁定说明区、表头、合计行及公式列。',
      data_start_row: DATA_START_ROW,
      max_rows: TEMPLATE_MAX_ROWS,
      field_count: FIELD_DICTIONARY.length
    };
  }

  /** 下载模板文件（鉴权 + 写 download_log） */
  @Get(':version/download')
  async download(
    @Param('version') version: string,
    @Req() req: Request & { user?: any },
    @Res() res: Response
  ) {
    const v = await this.service.getByVersion(version);
    const filePath = join(repoRoot(), v.file_path);
    if (!existsSync(filePath)) {
      throw new NotFoundException('模板文件丢失，请联系管理员');
    }

    // 写审计
    await this.audit.log(
      'TEMPLATE_DOWNLOAD',
      { target_type: 'template_version', target_id: v.id },
      { version },
      req.user?.sub
    );

    const filename = encodeURIComponent(
      `巴西整柜装箱清单_模板_v${v.version_no}.xlsx`
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${filename}`
    );
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.sendFile(filePath);
  }
}
