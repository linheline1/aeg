import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Inject,
  BadRequestException,
  HttpCode,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import { ImageRepo, ClientRepo, QuotesRepo, AuditRepo, repoRoot } from '../common/mock-db';

const IMAGE_DIR = path.join(repoRoot(), 'apps/api/uploads/images');
const MAX_FILES = 9;
const MAX_SIZE = 10 * 1024 * 1024; // 10MB / 张

/**
 * 客户图片资料（M5）
 *   客户端：上传 / 查看自己的图片
 *   POST   /api/client/images        multipart/form-data  field="files"（可多张）
 *   GET    /api/client/images        我的图片列表
 *   GET    /api/client/images/:id/file  查看图片文件（ownership 校验）
 */
@Controller('client/images')
@UseGuards(AuthGuard, RolesGuard)
@Roles('client')
export class ClientImageController {
  constructor(
    @Inject('ImageRepo') private readonly imageRepo: ImageRepo,
    @Inject('ClientRepo') private readonly clientRepo: ClientRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo,
    @Inject('QuotesRepo') private readonly quotesRepo: QuotesRepo
  ) {}

  @Post()
  @HttpCode(200)
  @UseInterceptors(FilesInterceptor('files', MAX_FILES, {
    storage: multer.diskStorage({
      destination: (_req: any, _file: any, cb: (err: any, dir: string) => void) => {
        fs.mkdirSync(IMAGE_DIR, { recursive: true });
        cb(null, IMAGE_DIR);
      },
      filename: (_req: any, file: any, cb: (err: any, name: string) => void) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `${crypto.randomUUID()}${ext}`);
      }
    }),
    limits: { fileSize: MAX_SIZE, files: MAX_FILES },
    fileFilter: (_req: any, file: any, cb: any) => {
      if (!/^image\//i.test(file.mimetype)) {
        return cb(new BadRequestException(`「${file.originalname}」不是图片文件`), false);
      }
      cb(null, true);
    }
  }))
  async upload(
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request & { user?: any }
  ): Promise<any> {
    const clientId = req.user?.client_id;
    if (!clientId) throw new BadRequestException('当前用户缺少 client_id');
    if (!files || files.length === 0) throw new BadRequestException('未收到图片文件');

    // 可选关联报价订单（补传明细截图）；校验订单存在且归属当前客户
    const quoteId: string | null = (req.body?.quote_id as string)?.trim() || null;
    // 可选关联明细行号（行级对应）；须与 quote_id 同时使用，且行号须存在于该报价的明细行
    let rowNo: number | null = null;
    const rowRaw = (req.body?.row_no as string)?.trim();
    if (quoteId) {
      const order = await this.quotesRepo.findById(quoteId);
      if (!order || order.client_id !== clientId) {
        throw new BadRequestException('关联的报价单不存在或不属于当前客户');
      }
      if (rowRaw) {
        rowNo = Number(rowRaw);
        if (!Number.isInteger(rowNo) || rowNo <= 0) throw new BadRequestException('明细行号必须是正整数');
        const validRows: number[] = (order.line_items || []).map((it: any) => it.row_no);
        if (!validRows.includes(rowNo)) {
          throw new BadRequestException(`行号 ${rowNo} 不在该报价单的明细行中（有效行号：${validRows.join('、') || '无'}）`);
        }
      }
    } else if (rowRaw) {
      throw new BadRequestException('指定明细行号时必须同时关联报价单');
    }

    const rows = files.map(f => ({
      client_id: clientId,
      quote_id: quoteId,
      row_no: rowNo,
      file_name: f.originalname,
      file_path: path.relative(repoRoot(), f.path).replace(/\\/g, '/'),
      mime_type: f.mimetype,
      size_bytes: f.size
    }));
    const saved = await this.imageRepo.insertMany(rows);

    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    await this.auditRepo.entry({
      actor_username: req.user?.username,
      actor_role: 'client',
      action: 'image.upload',
      target_type: 'client',
      target_id: clientId,
      detail: { count: saved.length, client_name: client?.name, quote_id: quoteId, row_no: rowNo, files: saved.map(s => s.file_name) }
    });

    return { ok: true, count: saved.length, images: saved };
  }

  @Get()
  async list(@Req() req: Request & { user?: any }): Promise<any> {
    const clientId = req.user?.client_id;
    if (!clientId) throw new BadRequestException('当前用户缺少 client_id');
    const rows = await this.imageRepo.findByClient(clientId);
    // 附带关联报价号（工作台展示）
    const withNo = await Promise.all(rows.map(async r => {
      if (!r.quote_id) return { ...r, quote_no: null };
      const q = await this.quotesRepo.findById(r.quote_id);
      return { ...r, quote_no: q?.quote_no || null };
    }));
    return withNo;
  }

  @Get(':id/file')
  async file(
    @Param('id') id: string,
    @Req() req: Request & { user?: any },
    @Res() res: Response
  ) {
    const img = await this.imageRepo.findById(id);
    if (!img) throw new NotFoundException('图片不存在');
    if (img.client_id !== req.user?.client_id) throw new ForbiddenException('无权访问该图片');
    const abs = path.join(repoRoot(), img.file_path);
    if (!fs.existsSync(abs)) throw new NotFoundException('图片文件已丢失');
    res.setHeader('Content-Type', img.mime_type);
    res.sendFile(abs);
  }
}

/**
 * 运营端：查看客户上传的图片
 *   GET /api/ops/images?client_id=xxx&quote_id=yyy   全部/按客户/按订单筛选（含客户名、报价号）
 *   GET /api/ops/images/:id/file        查看图片文件
 */
@Controller('ops/images')
@UseGuards(AuthGuard, RolesGuard)
@Roles('operator', 'admin')
export class OpsImageController {
  constructor(
    @Inject('ImageRepo') private readonly imageRepo: ImageRepo,
    @Inject('ClientRepo') private readonly clientRepo: ClientRepo,
    @Inject('QuotesRepo') private readonly quotesRepo: QuotesRepo
  ) {}

  @Get()
  async list(
    @Query('client_id') clientId?: string,
    @Query('quote_id') quoteId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ): Promise<any> {
    const { items: rows, total } = await this.imageRepo.findPaged({
      client_id: clientId || undefined,
      quote_id: quoteId || undefined,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 24
    });
    const clients = await this.clientRepo.findAll();
    const nameMap = new Map(clients.map(c => [c.id, c.name]));
    const items = await Promise.all(rows.map(async r => {
      let quoteNo: string | null = null;
      if (r.quote_id) {
        const q = await this.quotesRepo.findById(r.quote_id);
        quoteNo = q?.quote_no || null;
      }
      return { ...r, client_name: nameMap.get(r.client_id) || '未知客户', quote_no: quoteNo };
    }));
    return { items, total, page: Number(page) || 1, pageSize: Number(pageSize) || 24 };
  }

  /** 图片筛选器的客户选项（id + name） */
  @Get('meta/clients')
  async clientOptions() {
    const clients = await this.clientRepo.findAll();
    return clients.map(c => ({ id: c.id, name: c.name }));
  }

  @Get(':id/file')
  async file(@Param('id') id: string, @Res() res: Response) {
    const img = await this.imageRepo.findById(id);
    if (!img) throw new NotFoundException('图片不存在');
    const abs = path.join(repoRoot(), img.file_path);
    if (!fs.existsSync(abs)) throw new NotFoundException('图片文件已丢失');
    res.setHeader('Content-Type', img.mime_type);
    res.sendFile(abs);
  }
}
