import {
  BadRequestException, Body, Controller, ForbiddenException, Inject, NotFoundException,
  Post, Req, UploadedFile, UseGuards, UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import multer from 'multer';
import { AuthGuard, Roles, RolesGuard } from '../common/guards/auth.guard';
import { ClientRepo, repoRoot } from '../common/mock-db';
import { QuoteService } from './quote.service';

const TMP_DIR = path.join(repoRoot(), 'apps/api/uploads/tmp');

@Controller('ops/orders')
@UseGuards(AuthGuard, RolesGuard)
@Roles('operator', 'admin', 'sales')
export class OpsUploadController {
  constructor(
    private readonly quoteService: QuoteService,
    @Inject('ClientRepo') private readonly clientRepo: ClientRepo
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        fs.mkdirSync(TMP_DIR, { recursive: true });
        cb(null, TMP_DIR);
      },
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname) || '.xlsx'}`)
    }),
    limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!/\.xlsx$/i.test(file.originalname)) return cb(new BadRequestException('清单文件仅支持 .xlsx 格式'), false);
      cb(null, true);
    }
  }))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { client_id?: string },
    @Req() req: Request & { user?: any }
  ): Promise<any> {
    if (!file) throw new BadRequestException('未收到清单文件');
    try {
      const clientId = (body.client_id || '').trim();
      if (!clientId) throw new BadRequestException('请选择客户');
      const client: any = await this.clientRepo.findOne({ where: { id: clientId } });
      if (!client) throw new NotFoundException('客户不存在');
      if (client.status !== 'active') throw new BadRequestException('该客户已禁用，不能上传报价');
      if (req.user?.role === 'sales' && client.salesperson_id !== req.user.sub) {
        throw new ForbiddenException('只能为归属自己的客户上传报价');
      }
      const actor = { username: req.user?.username || 'system', role: req.user?.role || 'system' };
      const result = await this.quoteService.processUpload(file.path, file.originalname, clientId, '2.0', actor);
      if (!result.ok || !result.quote_id) return result;
      const diResult = await this.quoteService.runAutoDi(result.quote_id);
      if (!diResult.ok) {
        return {
          ...result,
          ok: false,
          error_summary: `清单已上传，但 AI DI 自动核算失败：${diResult.error || '未知错误'}`
        };
      }
      const computed = await this.quoteService.computeOrder(result.quote_id, actor);
      return { ...result, ...computed, quote_id: result.quote_id, status: 'done', price_is_reference: true };
    } catch (e) {
      try { fs.unlinkSync(file.path); } catch { /* 临时文件可能已清理 */ }
      throw e;
    }
  }
}
