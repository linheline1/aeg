import { Controller, Get, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import type { PartnerRepo } from '../common/mock-db';
import { repoRoot } from '../common/mock-db';
import { Public } from '../common/guards/auth.guard';
import { toPartnerItem } from './admin-partner.controller';

/**
 * 公开接口：官网合作伙伴页展示（无需登录）
 *   GET /api/partners           按分类返回合作伙伴（带 logo_url）
 *   GET /api/partners/:id/logo  查看 logo 图片文件
 */
@Controller('partners')
@Public()
export class PartnerPublicController {
  constructor(@Inject('PartnerRepo') private readonly partnerRepo: PartnerRepo) {}

  @Get()
  async list() {
    const [carriers, ecosystem] = await Promise.all([
      this.partnerRepo.findByCategory('carrier'),
      this.partnerRepo.findByCategory('ecosystem')
    ]);
    return {
      carriers: carriers.map(toPartnerItem),
      ecosystem: ecosystem.map(toPartnerItem)
    };
  }

  @Get(':id/logo')
  async logo(@Param('id') id: string, @Res() res: Response) {
    const row = await this.partnerRepo.findById(id);
    if (!row) throw new NotFoundException('合作伙伴不存在');
    const abs = path.join(repoRoot(), row.logo_file_path);
    if (!fs.existsSync(abs)) throw new NotFoundException('Logo 文件已丢失');
    res.setHeader('Content-Type', row.logo_mime_type || 'application/octet-stream');
    // 上传的 SVG 等文件不内联执行脚本；<img> 引用不受影响
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(abs);
  }
}
