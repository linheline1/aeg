import {
  Body, Controller, Delete, Get, Inject, Param, Post, Req, Res, UseGuards, UseInterceptors,
  UploadedFiles, BadRequestException, ForbiddenException, NotFoundException, HttpCode
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import { OrderFilesRepo, QuotesRepo, AuditRepo, repoRoot } from '../common/mock-db';

/** M8：订单交付文件存储目录 */
const FILE_DIR = path.join(repoRoot(), 'apps/api/uploads/orderfiles');
const MAX_FILES = 9;
const MAX_SIZE = 10 * 1024 * 1024; // 10MB / 个

/** 允许的文件类型：图片（放行截图等）+ PDF（发票） */
function isAllowedMime(mime: string): boolean {
  return /^image\//i.test(mime) || mime === 'application/pdf';
}

const KINDS = ['clearance_shot', 'invoice', 'other'] as const;

/**
 * M8 运营端：订单交付文件（放行截图 / 发票 PDF，操作员上传给客户）
 *   POST   /api/ops/orders/:id/files    multipart  field="files"（图片/PDF，可多个）+ kind
 *   GET    /api/ops/orders/:id/files    该订单的交付文件列表
 *   DELETE /api/ops/files/:fileId       删除文件记录
 *   GET    /api/ops/files/:fileId/file  下载/预览文件
 */
@Controller('ops')
@UseGuards(AuthGuard, RolesGuard)
@Roles('operator', 'admin')
export class OpsOrderFilesController {
  constructor(
    @Inject('OrderFilesRepo') private readonly filesRepo: OrderFilesRepo,
    @Inject('QuotesRepo') private readonly quotesRepo: QuotesRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo
  ) {}

  @Post('orders/:id/files')
  @HttpCode(200)
  @UseInterceptors(FilesInterceptor('files', MAX_FILES, {
    storage: multer.diskStorage({
      destination: (_req: any, _file: any, cb: (err: any, dir: string) => void) => {
        fs.mkdirSync(FILE_DIR, { recursive: true });
        cb(null, FILE_DIR);
      },
      filename: (_req: any, file: any, cb: (err: any, name: string) => void) => {
        const ext = path.extname(file.originalname) || '';
        cb(null, `${crypto.randomUUID()}${ext}`);
      }
    }),
    limits: { fileSize: MAX_SIZE, files: MAX_FILES },
    fileFilter: (_req: any, file: any, cb: any) => {
      if (!isAllowedMime(file.mimetype)) {
        return cb(new BadRequestException(`「${file.originalname}」不是图片或 PDF 文件`), false);
      }
      cb(null, true);
    }
  }))
  async upload(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { kind?: string; note?: string },
    @Req() req: Request & { user?: any }
  ): Promise<any> {
    const order: any = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('订单不存在');
    if (order.status !== 'done') throw new BadRequestException('仅已核算发布（done）的订单可上传交付文件');
    if (!files || files.length === 0) throw new BadRequestException('未收到文件');

    const kind = (body?.kind || 'other') as typeof KINDS[number];
    if (!KINDS.includes(kind)) throw new BadRequestException(`kind 必须是 ${KINDS.join(' / ')}`);
    const note = body?.note?.trim() || null;

    const rows = files.map(f => ({
      quote_id: id,
      kind,
      file_name: f.originalname,
      file_path: path.relative(repoRoot(), f.path).replace(/\\/g, '/'),
      mime_type: f.mimetype,
      size_bytes: f.size,
      note,
      uploaded_by: req.user?.username || 'unknown'
    }));
    const saved = await this.filesRepo.insertMany(rows);

    await this.auditRepo.entry({
      actor_username: req.user?.username,
      actor_role: req.user?.role || 'operator',
      action: 'order.file.upload',
      target_type: 'quote',
      target_id: id,
      detail: { quote_no: order.quote_no, kind, count: saved.length, files: saved.map(s => s.file_name) }
    });

    return { ok: true, count: saved.length, files: saved };
  }

  @Get('orders/:id/files')
  async list(@Param('id') id: string): Promise<any> {
    const order: any = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('订单不存在');
    return this.filesRepo.findByQuote(id);
  }

  @Delete('files/:fileId')
  async remove(@Param('fileId') fileId: string, @Req() req: Request & { user?: any }) {
    const row = await this.filesRepo.findById(fileId);
    if (!row) throw new NotFoundException('文件不存在');
    const order: any = await this.quotesRepo.findById(row.quote_id);
    await this.filesRepo.deleteById(fileId);
    // 同步删除磁盘文件（失败不影响记录删除）
    try { fs.unlinkSync(path.join(repoRoot(), row.file_path)); } catch { /* 文件可能已不存在 */ }
    await this.auditRepo.entry({
      actor_username: req.user?.username,
      actor_role: req.user?.role || 'operator',
      action: 'order.file.delete',
      target_type: 'quote',
      target_id: row.quote_id,
      detail: { quote_no: order?.quote_no, kind: row.kind, file: row.file_name }
    });
    return { ok: true };
  }

  @Get('files/:fileId/file')
  async file(@Param('fileId') fileId: string, @Res() res: Response) {
    const row = await this.filesRepo.findById(fileId);
    if (!row) throw new NotFoundException('文件不存在');
    const abs = path.join(repoRoot(), row.file_path);
    if (!fs.existsSync(abs)) throw new NotFoundException('文件已丢失');
    res.setHeader('Content-Type', row.mime_type);
    res.sendFile(abs);
  }
}

/**
 * M8 客户端：查看/下载订单交付文件（放行截图 / 发票 PDF）
 *   GET /api/client/orders/:id/files      该订单的交付文件列表
 *   GET /api/client/files/:fileId/file    下载/预览文件（ownership 校验）
 */
@Controller('client')
@UseGuards(AuthGuard, RolesGuard)
@Roles('client')
export class ClientOrderFilesController {
  constructor(
    @Inject('OrderFilesRepo') private readonly filesRepo: OrderFilesRepo,
    @Inject('QuotesRepo') private readonly quotesRepo: QuotesRepo
  ) {}

  @Get('orders/:id/files')
  async list(@Param('id') id: string, @Req() req: Request & { user?: any }): Promise<any> {
    const order: any = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('订单不存在');
    if (order.client_id !== req.user?.client_id) throw new ForbiddenException('无权访问该订单');
    return this.filesRepo.findByQuote(id);
  }

  @Get('files/:fileId/file')
  async file(@Param('fileId') fileId: string, @Req() req: Request & { user?: any }, @Res() res: Response) {
    const row = await this.filesRepo.findById(fileId);
    if (!row) throw new NotFoundException('文件不存在');
    const order: any = await this.quotesRepo.findById(row.quote_id);
    if (!order || order.client_id !== req.user?.client_id) {
      throw new ForbiddenException('无权访问该文件');
    }
    const abs = path.join(repoRoot(), row.file_path);
    if (!fs.existsSync(abs)) throw new NotFoundException('文件已丢失');
    res.setHeader('Content-Type', row.mime_type);
    res.sendFile(abs);
  }
}
