import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Inject,
  Req,
  BadRequestException,
  HttpCode
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import { Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import { QuoteService } from './quote.service';
import { ImageRepo, AuditRepo, QuotesRepo, repoRoot } from '../common/mock-db';

const TMP_DIR = path.join(repoRoot(), 'apps/api/uploads/tmp');
const IMAGE_DIR = path.join(repoRoot(), 'apps/api/uploads/images');

/**
 * 客户端上传 Excel → 获取 DDP 报价（M6：可同时附上明细截图，自动绑定新订单）
 *   POST /api/client/orders/upload
 *   multipart/form-data  field="file"（.xlsx 必填）+ field="files"（明细截图，可多张，可选）
 *   可选 field="row_map"：JSON 字符串 { "截图文件名": 行号 }，将截图对应到明细行
 *   Response: { ok, quote_no, quote_id, status, ..., images_count }
 */
@Controller('client/orders')
@UseGuards(AuthGuard, RolesGuard)
@Roles('client')
export class ClientUploadController {
  constructor(
    private readonly quoteService: QuoteService,
    @Inject('ImageRepo') private readonly imageRepo: ImageRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo,
    @Inject('QuotesRepo') private readonly quotesRepo: QuotesRepo
  ) {}

  private static readonly excelScreenshotsInterceptor = FileFieldsInterceptor(
    [{ name: 'file', maxCount: 1 }, { name: 'files', maxCount: 9 }],
    {
      storage: multer.diskStorage({
        destination: (_req: any, file: any, cb: (err: any, dir: string) => void) => {
          if (file.fieldname === 'files') {
            fs.mkdirSync(IMAGE_DIR, { recursive: true });
            cb(null, IMAGE_DIR);
          } else {
            fs.mkdirSync(TMP_DIR, { recursive: true });
            cb(null, TMP_DIR);
          }
        },
        filename: (_req: any, file: any, cb: (err: any, name: string) => void) => {
          if (file.fieldname === 'files') {
            const ext = path.extname(file.originalname) || '.jpg';
            cb(null, `${crypto.randomUUID()}${ext}`);
          } else {
            cb(null, `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname) || '.xlsx'}`);
          }
        }
      }),
      limits: { fileSize: 20 * 1024 * 1024, files: 10 },
      fileFilter: (_req: any, file: any, cb: any) => {
        if (file.fieldname === 'file') {
          if (!/\.xlsx$/i.test(file.originalname)) {
            return cb(new BadRequestException('清单文件仅支持 .xlsx 格式'), false);
          }
        } else if (file.fieldname === 'files') {
          if (!/^image\//i.test(file.mimetype)) {
            return cb(new BadRequestException(`截图「${file.originalname}」不是图片文件`), false);
          }
        }
        cb(null, true);
      }
    }
  );

  @Post('upload/preview')
  @HttpCode(200)
  @UseInterceptors(ClientUploadController.excelScreenshotsInterceptor)
  async preview(
    @UploadedFiles() files: { [key: string]: Express.Multer.File[] },
    @Req() req: Request & { user?: any }
  ) {
    const xlsx = files.file?.[0];
    if (!xlsx) throw new BadRequestException('未收到清单文件');
    const clientId = req.user?.client_id;
    if (!clientId) throw new BadRequestException('当前用户缺少 client_id');
    const screenshots = this.screenshotMetadata(files.files || [], req.body?.row_map);
    return this.quoteService.previewUpload(xlsx.path, xlsx.originalname, clientId, '2.0', screenshots);
  }

  @Post('upload/confirm')
  @HttpCode(200)
  async confirm(@Body() body: any, @Req() req: Request & { user?: any }) {
    const clientId = req.user?.client_id;
    if (!clientId) throw new BadRequestException('当前用户缺少 client_id');
    const result = await this.quoteService.confirmUpload(
      String(body?.draft_id || ''),
      clientId,
      body?.rows,
      String(body?.declared_currency || ''),
      { username: req.user?.username, role: req.user?.role || 'client' }
    );
    if (!result.draft_id) return result;
    if (result.quote_id) {
      void (async () => {
        const diResult = await this.quoteService.runAutoDi(result.quote_id!);
        if (diResult.ok) {
          await this.quoteService.computeOrder(result.quote_id!, { username: 'system', role: 'system' });
        }
      })().catch(() => undefined);
    }
    const draft = await this.quoteService.getUploadDraft(result.draft_id, clientId);
    const bound = await this.bindScreenshots(result, clientId, draft.screenshots || [], req.user?.username || 'client');
    return { ...result, ...bound };
  }

  @Delete('upload/:draftId')
  cancel(@Param('draftId') draftId: string, @Req() req: Request & { user?: any }) {
    const clientId = req.user?.client_id;
    if (!clientId) throw new BadRequestException('当前用户缺少 client_id');
    return this.quoteService.cancelUpload(draftId, clientId);
  }

  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(ClientUploadController.excelScreenshotsInterceptor)
  async upload(
    @UploadedFiles() files: { [key: string]: Express.Multer.File[] },
    @Req() req: Request & { user?: any }
  ) {
    const xlsx = files.file?.[0];
    if (!xlsx) throw new BadRequestException('未收到清单文件');
    const clientId = req.user?.client_id;
    if (!clientId) throw new BadRequestException('当前用户缺少 client_id');
    const result = await this.quoteService.processUpload(
      xlsx.path,
      xlsx.originalname,
      clientId,
      '2.0',
      { username: req.user?.username, role: req.user?.role || 'client' }
    );
    if (!result.ok || !result.quote_id) return result;
    const bound = await this.bindScreenshots(
      result,
      clientId,
      this.screenshotMetadata(files.files || [], req.body?.row_map),
      req.user?.username || 'client'
    );
    return { ...result, ...bound };
  }

  private screenshotMetadata(files: Express.Multer.File[], rowMapRaw?: string): any[] {
    const rowMap: Record<string, number> = {};
    try {
      const parsed = JSON.parse(String(rowMapRaw || '{}'));
      for (const [key, value] of Object.entries(parsed || {})) {
        const rowNo = Number(value);
        if (Number.isInteger(rowNo) && rowNo > 0) rowMap[key] = rowNo;
      }
    } catch { /* ignore */ }
    return files.map(file => ({
      originalname: file.originalname,
      file_path: path.relative(repoRoot(), file.path).replace(/\\/g, '/'),
      mimetype: file.mimetype,
      size: file.size,
      row_no: rowMap[file.originalname] || null
    }));
  }

  private async bindScreenshots(result: any, clientId: string, shots: any[], username: string) {
    if (!result.quote_id || shots.length === 0) return { images_count: 0 };
    const quote = await this.quotesRepo.findById(result.quote_id);
    const validRows = new Set<number>((quote?.line_items || []).map((item: any) => item.row_no));
    const rows = shots.map(file => ({
      client_id: clientId,
      quote_id: result.quote_id,
      row_no: file.row_no && validRows.has(Number(file.row_no)) ? Number(file.row_no) : null,
      file_name: file.originalname,
      file_path: file.file_path,
      mime_type: file.mimetype,
      size_bytes: file.size
    }));
    await this.imageRepo.insertMany(rows);
    await this.auditRepo.entry({
      actor_username: username,
      actor_role: 'client',
      action: 'image.upload',
      target_type: 'quote',
      target_id: result.quote_id,
      detail: {
        count: rows.length,
        quote_no: result.quote_no,
        files: rows.map(row => row.file_name),
        row_map: rows.map(row => ({ file: row.file_name, row_no: row.row_no }))
      }
    });
    return { images_count: rows.length };
  }
}
