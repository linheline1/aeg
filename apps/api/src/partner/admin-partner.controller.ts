import {
  Controller, Delete, Get, Inject, Param, Post, Patch, Body, Req, Res, UseGuards, UseInterceptors, UploadedFile,
  BadRequestException, HttpCode
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import type { PartnerRepo, PartnerRow, AuditRepo } from '../common/mock-db';
import { repoRoot } from '../common/mock-db';

export const PARTNER_LOGO_DIR = path.join(repoRoot(), 'apps/api/uploads/partners');
const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5MB
const CATEGORIES = ['carrier', 'ecosystem'] as const;
type Category = typeof CATEGORIES[number];

export function toPartnerItem(row: PartnerRow) {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    logo_url: `/api/partners/${row.id}/logo`,
    website_url: row.website_url || '',
    created_at: row.created_at
  };
}

/** 校验官网链接：空串表示清除；必须以 http(s):// 开头 */
function normalizeWebsiteUrl(raw: unknown): string {
  const url = String(raw ?? '').trim();
  if (!url) return '';
  if (!/^https?:\/\/.+/i.test(url) || url.length > 300) {
    throw new BadRequestException('官网链接必须以 http:// 或 https:// 开头，且不超过 300 个字符');
  }
  return url;
}

/**
 * 管理端：合作伙伴维护（海运承运商 / 生态合作伙伴，品牌 logo 必传）
 *   GET    /api/admin/partners        全部列表（带 logo_url）
 *   POST   /api/admin/partners        新增（multipart/form-data：name、category、logo 文件、website_url 选填）
 *   PATCH  /api/admin/partners/:id    编辑官网链接
 *   DELETE /api/admin/partners/:id    删除（同时清理 logo 物理文件）
 */
@Controller('admin/partners')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminPartnerController {
  constructor(
    @Inject('PartnerRepo') private readonly partnerRepo: PartnerRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo
  ) {}

  @Get()
  async list() {
    const rows = await this.partnerRepo.listAll();
    return { items: rows.map(toPartnerItem) };
  }

  @Post()
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('logo', {
    storage: multer.diskStorage({
      destination: (_req: any, _file: any, cb: (err: any, dir: string) => void) => {
        fs.mkdirSync(PARTNER_LOGO_DIR, { recursive: true });
        cb(null, PARTNER_LOGO_DIR);
      },
      filename: (_req: any, file: any, cb: (err: any, name: string) => void) => {
        const ext = path.extname(file.originalname) || `.${String(file.mimetype).split('/')[1] || 'png'}`;
        cb(null, `${crypto.randomUUID()}${ext}`);
      }
    }),
    limits: { fileSize: MAX_LOGO_SIZE, files: 1 },
    fileFilter: (_req: any, file: any, cb: any) => {
      if (!/^image\//i.test(file.mimetype)) {
        return cb(new BadRequestException(`「${file.originalname}」不是图片文件`), false);
      }
      cb(null, true);
    }
  }))
  async create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request & { user?: any }
  ) {
    const name = String(req.body?.name ?? '').trim();
    const category = String(req.body?.category ?? '').trim() as Category;
    const websiteUrl = normalizeWebsiteUrl(req.body?.website_url);
    if (!name) throw new BadRequestException('合作伙伴名称不能为空');
    if (name.length > 120) throw new BadRequestException('合作伙伴名称不能超过 120 个字符');
    if (!CATEGORIES.includes(category)) {
      throw new BadRequestException('分类必须是 carrier（海运承运商）或 ecosystem（生态合作伙伴）');
    }
    if (!file) throw new BadRequestException('必须上传品牌 logo 图片');

    const all = await this.partnerRepo.listAll();
    if (all.some(p => p.category === category && p.name === name)) {
      throw new BadRequestException(`该分类下已存在同名合作伙伴「${name}」`);
    }

    const row = await this.partnerRepo.insert({
      category,
      name,
      logo_file_path: path.relative(repoRoot(), file.path).replace(/\\/g, '/'),
      logo_mime_type: file.mimetype,
      logo_size_bytes: file.size,
      website_url: websiteUrl
    });

    await this.auditRepo.entry({
      actor_username: req.user?.username || 'system',
      actor_role: req.user?.role || 'system',
      action: 'partner.create',
      target_type: 'partner',
      target_id: row.id,
      detail: { category, name, logo_file: file.originalname, logo_size_bytes: file.size, website_url: websiteUrl }
    });

    return { ok: true, partner: toPartnerItem(row) };
  }

  @Patch(':id')
  async updateWebsite(
    @Param('id') id: string,
    @Body() body: { website_url?: string },
    @Req() req: Request & { user?: any }
  ) {
    const row = await this.partnerRepo.findById(id);
    if (!row) throw new BadRequestException('合作伙伴不存在或已被删除');
    const websiteUrl = normalizeWebsiteUrl(body?.website_url);
    const updated = await this.partnerRepo.updateWebsite(id, websiteUrl);
    if (!updated) throw new BadRequestException('合作伙伴不存在或已被删除');

    await this.auditRepo.entry({
      actor_username: req.user?.username || 'system',
      actor_role: req.user?.role || 'system',
      action: 'partner.update',
      target_type: 'partner',
      target_id: id,
      detail: { category: updated.category, name: updated.name, website_url: websiteUrl }
    });

    return { ok: true, partner: toPartnerItem(updated) };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    const row = await this.partnerRepo.findById(id);
    if (!row) throw new BadRequestException('合作伙伴不存在或已被删除');
    const removed = await this.partnerRepo.remove(id);
    if (!removed) throw new BadRequestException('合作伙伴不存在或已被删除');

    // 清理 logo 物理文件（尽力而为，失败不影响删除结果）
    try {
      const abs = path.join(repoRoot(), row.logo_file_path);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch { /* 忽略文件清理失败 */ }

    await this.auditRepo.entry({
      actor_username: req.user?.username || 'system',
      actor_role: req.user?.role || 'system',
      action: 'partner.delete',
      target_type: 'partner',
      target_id: row.id,
      detail: { category: row.category, name: row.name }
    });

    return { ok: true };
  }
}
