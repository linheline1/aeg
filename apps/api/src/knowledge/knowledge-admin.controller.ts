import {
  BadRequestException, Body, Controller, Delete, Get, Inject, Logger, NotFoundException,
  Param, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';
import multer from 'multer';
import type { Request } from 'express';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import type { AuditRepo, KnowledgeDocRepo, KnowledgeDocRow, KnowledgeChunk } from '../common/mock-db';
import { repoRoot } from '../common/mock-db';
import { KnowledgeService } from './knowledge.service';
import { chunksFromMarkdown, priceTableChunks, validatePriceTable, type SearchHit } from './knowledge.utils';

const UPLOAD_DIR = path.join(repoRoot(), 'apps/api/uploads/tmp');
const uploadOptions: any = {
  storage: multer.diskStorage({
    destination: (_req: any, _file: any, cb: any) => {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    },
    filename: (_req: any, _file: any, cb: any) => cb(null, `kb-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`)
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (/\.xlsx$/i.test(file.originalname || '')) cb(null, true);
    else cb(new BadRequestException('仅支持 .xlsx 文件'), false);
  }
};

interface DocPayload {
  title?: string;
  kind?: 'price_table' | 'doc';
  tags?: string[];
  version?: string;
  effective_date?: string | null;
  summary?: string;
  content?: string;
  is_current?: boolean;
}

interface DocView {
  id: string;
  title: string;
  kind: 'price_table' | 'doc';
  tags: string[];
  status: 'active' | 'archived';
  is_current: boolean;
  version: string;
  effective_date: string | null;
  source_file: string | null;
  summary: string;
  content_chars: number;
  chunks: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toView(row: KnowledgeDocRow): DocView {
  return {
    id: row.id, title: row.title, kind: row.kind, tags: row.tags || [],
    status: row.status, is_current: !!row.is_current, version: row.version,
    effective_date: row.effective_date || null, source_file: row.source_file || null,
    summary: row.summary, content_chars: (row.content || '').length,
    chunks: (row.chunks || []).length, created_by: row.created_by,
    created_at: row.created_at, updated_at: row.updated_at
  };
}

@Controller('admin/knowledge')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class KnowledgeAdminController {
  private readonly logger = new Logger('KnowledgeAdmin');

  constructor(
    @Inject('KnowledgeDocRepo') private readonly docs: KnowledgeDocRepo,
    @Inject('AuditRepo') private readonly audit: AuditRepo,
    private readonly service: KnowledgeService
  ) {}

  private async entry(req: Request & { user?: any }, action: string, id: string, detail: any) {
    try {
      await this.audit.entry({
        actor_username: req.user?.username || 'system',
        actor_role: req.user?.role || 'system',
        action, target_type: 'knowledge_doc', target_id: id, detail
      });
    } catch (error) { this.logger.warn(`audit failed: ${String(error)}`); }
  }

  @Get()
  async list(): Promise<{ items: DocView[]; current: DocView | null }> {
    const rows = await this.docs.findAll({ includeArchived: true });
    const current = rows.find(row => row.kind === 'price_table' && row.is_current && row.status === 'active') || null;
    return { items: rows.map(toView), current: current ? toView(current) : null };
  }

  @Get('price-table/current')
  async currentPriceTable() {
    const active = await this.service.activePriceTable();
    return {
      source: active.source, docId: active.docId, version: active.version,
      title: active.title, channels: active.table.channels.length,
      effectiveDate: (active.table as any).effectiveDate || null
    };
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<KnowledgeDocRow> {
    const row = await this.docs.findById(id);
    if (!row) throw new NotFoundException('知识库文档不存在');
    return row;
  }

  /** 检索预览：模拟 AI 询价会拿到哪些片段 */
  @Post('search')
  async search(@Body() body: { query?: string; limit?: number }): Promise<{ hits: SearchHit[]; context: string }> {
    if (!body?.query?.trim()) throw new BadRequestException('query 不能为空');
    const hits = await this.service.search(body.query, Math.min(Math.max(Number(body.limit) || 4, 1), 10));
    return { hits, context: KnowledgeService.renderContext(hits) };
  }

  private normalizePayload(body: DocPayload, existing?: KnowledgeDocRow) {
    const kind = body.kind || existing?.kind || 'doc';
    if (!['price_table', 'doc'].includes(kind)) throw new BadRequestException('kind 只能是 price_table / doc');
    const title = (body.title ?? existing?.title ?? '').trim();
    if (!title) throw new BadRequestException('标题不能为空');
    const content = body.content ?? existing?.content ?? '';
    if (!content.trim()) throw new BadRequestException('内容不能为空');
    const tags = Array.isArray(body.tags) ? body.tags.map(tag => String(tag).trim()).filter(Boolean).slice(0, 20)
      : (existing?.tags || []);
    let chunks: KnowledgeChunk[];
    if (kind === 'price_table') {
      let parsed: any;
      try { parsed = JSON.parse(content); } catch { throw new BadRequestException('价目表内容必须是合法 JSON'); }
      if (!validatePriceTable(parsed)) throw new BadRequestException('价目表结构不合法：需包含 version 与非空 channels，且每个渠道含 code/country/mode/tiers/classes/rules');
      chunks = priceTableChunks(parsed);
    } else {
      chunks = chunksFromMarkdown(content, title);
    }
    return {
      title, kind: kind as 'price_table' | 'doc', tags,
      version: (body.version ?? existing?.version ?? '').trim(),
      effective_date: body.effective_date ?? existing?.effective_date ?? null,
      summary: (body.summary ?? existing?.summary ?? '').slice(0, 500),
      content, chunks,
      is_current: kind === 'price_table' ? !!body.is_current : false,
      status: (existing?.status || 'active') as 'active' | 'archived',
      source_file: existing?.source_file || null,
      created_by: existing?.created_by || 'system'
    };
  }

  @Post()
  async create(@Body() body: DocPayload, @Req() req: Request & { user?: any }) {
    const payload = this.normalizePayload(body);
    const row = await this.docs.insert({
      ...payload,
      is_current: !!body.is_current && payload.kind === 'price_table',
      status: 'active',
      source_file: null,
      created_by: req.user?.username || 'system'
    });
    await this.entry(req, 'knowledge.create', row.id, { title: row.title, kind: row.kind });
    return toView(row);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: DocPayload, @Req() req: Request & { user?: any }) {
    const existing = await this.docs.findById(id);
    if (!existing) throw new NotFoundException('知识库文档不存在');
    const payload = this.normalizePayload(body, existing);
    const row = await this.docs.update(id, payload);
    await this.entry(req, 'knowledge.update', id, { title: payload.title, kind: payload.kind });
    return toView(row!);
  }

  @Post(':id/set-current')
  async setCurrent(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    const row = await this.docs.setCurrent(id);
    if (!row) throw new NotFoundException('文档不存在或不是价目表');
    await this.entry(req, 'knowledge.set_current', id, { title: row.title, version: row.version });
    return toView(row);
  }

  @Post(':id/archive')
  async archive(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    const row = await this.docs.update(id, { status: 'archived', is_current: false });
    if (!row) throw new NotFoundException('知识库文档不存在');
    await this.entry(req, 'knowledge.archive', id, { title: row.title });
    return toView(row);
  }

  @Post(':id/restore')
  async restore(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    const row = await this.docs.update(id, { status: 'active' });
    if (!row) throw new NotFoundException('知识库文档不存在');
    await this.entry(req, 'knowledge.restore', id, { title: row.title });
    return toView(row);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    const ok = await this.docs.deleteById(id);
    if (!ok) throw new NotFoundException('知识库文档不存在');
    await this.entry(req, 'knowledge.delete', id, {});
    return { ok: true, id };
  }

  /** 上传 xlsx → 解析为 Markdown 文档入库（不覆盖已有资料） */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { title?: string; tags?: string; version?: string; effective_date?: string; summary?: string },
    @Req() req: Request & { user?: any }
  ) {
    if (!file) throw new BadRequestException('请选择 .xlsx 文件');
    try {
      const tags = body.tags ? body.tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean) : undefined;
      const row = await this.service.importWorkbook(file.path, {
        title: body.title, tags, version: body.version,
        effectiveDate: body.effective_date || null, summary: body.summary,
        createdBy: req.user?.username || 'system',
        sourceFile: file.originalname
      });
      await this.entry(req, 'knowledge.import', row.id, {
        title: row.title, source_file: row.source_file, chunks: row.chunks.length
      });
      return toView(row);
    } catch (error) {
      this.logger.warn(`knowledge import failed: ${String(error)}`);
      throw new BadRequestException(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      try { fs.unlinkSync(file.path); } catch { /* 临时文件清理失败不影响结果 */ }
    }
  }
}
