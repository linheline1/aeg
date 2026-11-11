import {
  BadRequestException, Body, Controller, Delete, Get, Inject, Param, Post, Put, Req, UseGuards
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import type { AiConfigRepo, AiConfigRow, AuditRepo } from '../common/mock-db';

interface AiConfigBody {
  name?: string;
  base_url?: string;
  api_key?: string;
  model?: string;
  timeout_ms?: number;
}

function maskKey(k: string): string {
  if (!k) return '';
  if (k.length <= 4) return '••••';
  return `••••••••${k.slice(-4)}`;
}

function toProfile(row: AiConfigRow) {
  return {
    id: row.id,
    name: row.name,
    base_url: row.base_url,
    model: row.model,
    timeout_ms: row.timeout_ms,
    active: !!row.active,
    has_api_key: !!row.api_key,
    api_key_masked: maskKey(row.api_key),
    updated_by: row.updated_by,
    updated_at: row.updated_at
  };
}

async function pickValues(body: AiConfigBody, repo: AiConfigRepo, selfId?: string) {
  const name = String(body.name ?? '').trim();
  const base_url = String(body.base_url ?? '').trim();
  const model = String(body.model ?? '').trim();
  const timeout_ms = Number(body.timeout_ms);
  if (!name) throw new BadRequestException('配置名称不能为空');
  if (name.length > 60) throw new BadRequestException('配置名称不能超过 60 个字符');
  const all = await repo.listAll();
  if (all.some(p => p.name === name && p.id !== selfId)) {
    throw new BadRequestException(`已存在同名配置「${name}」，请换一个名称`);
  }
  if (!/^https?:\/\//i.test(base_url)) {
    throw new BadRequestException('Base URL 必须以 http:// 或 https:// 开头');
  }
  if (!model) throw new BadRequestException('模型名称不能为空');
  if (!Number.isFinite(timeout_ms) || timeout_ms < 1000 || timeout_ms > 600000) {
    throw new BadRequestException('超时时间需在 1000–600000 毫秒之间');
  }
  const api_key = typeof body.api_key === 'string' ? body.api_key.trim() : undefined;
  return { name, base_url, model, timeout_ms, api_key };
}

/**
 * 管理端：AI 模型 API 配置（多配置档案，运行时维护，覆盖环境变量）
 *   GET    /api/admin/ai-config → 当前启用配置（API Key 脱敏）
 *   GET    /api/admin/ai-config/profiles → 全部配置列表（启用中的排最前）
 *   POST   /api/admin/ai-config/profiles → 新建配置（首个自动启用）
 *   PUT    /api/admin/ai-config/profiles/:id → 编辑配置；api_key 留空表示保持原值
 *   POST   /api/admin/ai-config/profiles/:id/activate → 切换为启用中的配置
 *   DELETE /api/admin/ai-config/profiles/:id → 删除配置（启用中的不可删）
 *   POST   /api/admin/ai-config/test → 用当前启用配置发一条最小请求，验证可用性
 *   POST   /api/admin/ai-config/models → 用指定 Base URL + Key 同步可用模型列表
 */
@Controller('admin/ai-config')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AiConfigController {
  constructor(
    @Inject('AiConfigRepo') private readonly repo: AiConfigRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo
  ) {}

  private async audit(req: Request & { user?: any }, action: string, detail: Record<string, unknown>) {
    await this.auditRepo.entry({
      actor_username: req.user?.username || 'system',
      actor_role: req.user?.role || 'system',
      action,
      target_type: 'ai_config',
      target_id: 'default',
      detail
    });
  }

  @Get()
  async get() {
    const row = await this.repo.get();
    const resolved = await this.repo.resolve('gpt-4o-mini', 30000);
    const effective = row
      ? { base_url: row.base_url, model: row.model, timeout_ms: row.timeout_ms, api_key: row.api_key }
      : { base_url: resolved.baseUrl, model: resolved.model, timeout_ms: resolved.timeoutMs, api_key: resolved.apiKey };
    return {
      source: resolved.source,
      config: {
        base_url: effective.base_url,
        model: effective.model,
        timeout_ms: effective.timeout_ms,
        has_api_key: !!effective.api_key,
        api_key_masked: maskKey(effective.api_key),
        updated_by: row?.updated_by || null,
        updated_at: row?.updated_at || null
      }
    };
  }

  @Get('profiles')
  async profiles() {
    const rows = await this.repo.listAll();
    return { items: rows.map(toProfile) };
  }

  @Post('profiles')
  async create(@Body() body: AiConfigBody, @Req() req: Request & { user?: any }) {
    const values = await pickValues(body, this.repo);
    const row = await this.repo.upsertProfile(values, req.user?.username || 'system');
    await this.audit(req, 'ai_config.profile_create', {
      name: row.name,
      base_url: row.base_url,
      model: row.model,
      timeout_ms: row.timeout_ms,
      api_key_changed: !!values.api_key,
      auto_activated: !!row.active
    });
    return { ok: true, profile: toProfile(row) };
  }

  @Put('profiles/:id')
  async update(@Param('id') id: string, @Body() body: AiConfigBody, @Req() req: Request & { user?: any }) {
    const before = await this.repo.findById(id);
    if (!before) throw new BadRequestException('配置不存在或已被删除');
    const values = await pickValues(body, this.repo, id);
    const row = await this.repo.upsertProfile({ ...values, id }, req.user?.username || 'system');
    await this.audit(req, 'ai_config.profile_update', {
      name: row.name,
      base_url: row.base_url,
      model: row.model,
      before_model: before.model,
      timeout_ms: row.timeout_ms,
      api_key_changed: !!values.api_key
    });
    return { ok: true, profile: toProfile(row) };
  }

  @Post('profiles/:id/activate')
  async activate(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    const before = await this.repo.findById(id);
    if (!before) throw new BadRequestException('配置不存在或已被删除');
    const row = await this.repo.activate(id, req.user?.username || 'system');
    if (!row) throw new BadRequestException('配置不存在或已被删除');
    await this.audit(req, 'ai_config.profile_activate', { name: row.name, model: row.model });
    return { ok: true, profile: toProfile(row) };
  }

  @Delete('profiles/:id')
  async remove(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    const row = await this.repo.findById(id);
    if (!row) throw new BadRequestException('配置不存在或已被删除');
    if (row.active) throw new BadRequestException('「' + row.name + '」正在使用中，请先切换到其他配置再删除');
    const ok = await this.repo.remove(id);
    if (!ok) throw new BadRequestException('配置不存在或已被删除');
    await this.audit(req, 'ai_config.profile_delete', { name: row.name, model: row.model });
    return { ok: true };
  }

  /** 连接测试：用当前启用配置发一条最小 chat 请求，返回延迟与回复 */
  @Post('test')
  async test() {
    const resolved = await this.repo.resolve('gpt-4o-mini', 30000);
    if (!resolved.apiKey) {
      throw new BadRequestException('当前启用的配置尚未设置 API Key，请先编辑该配置补上密钥后再测试');
    }
    const timeoutMs = Math.min(resolved.timeoutMs, 30000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const res = await fetch(`${resolved.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resolved.apiKey}`
        },
        body: JSON.stringify({
          model: resolved.model,
          temperature: 0,
          max_tokens: 16,
          messages: [{ role: 'user', content: '连接测试，请只回复 OK' }]
        }),
        signal: controller.signal
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new BadRequestException(`AI 服务返回 ${res.status}：${text.slice(0, 200)}`);
      }
      const body: any = await res.json();
      const reply = String(body?.choices?.[0]?.message?.content || '').trim();
      return {
        ok: true,
        base_url: resolved.baseUrl,
        model: resolved.model,
        latency_ms: Date.now() - started,
        reply: reply.slice(0, 120) || '(空回复)'
      };
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      if (e?.name === 'AbortError') {
        throw new BadRequestException(`连接超时（超过 ${timeoutMs}ms），请检查 Base URL 或调大超时时间`);
      }
      throw new BadRequestException(`连接失败：${e?.message || e}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /** 同步模型列表：GET {base}/models；密钥优先用表单新填的，否则回退到所编辑配置已存的密钥 */
  @Post('models')
  async listModels(@Body() body: { base_url?: string; api_key?: string; profile_id?: string }) {
    const baseUrl = String(body?.base_url || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(baseUrl)) {
      throw new BadRequestException('Base URL 必须以 http:// 或 https:// 开头');
    }
    let apiKey = String(body?.api_key || '').trim();
    if (!apiKey && body?.profile_id) {
      const row = await this.repo.findById(String(body.profile_id));
      apiKey = row?.api_key || '';
    }
    if (!apiKey) {
      throw new BadRequestException('请先填写 API Key（或打开已保存密钥的配置编辑）再同步模型列表');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new BadRequestException(`AI 服务返回 ${res.status}：${text.slice(0, 200)}`);
      }
      const json: any = await res.json();
      const models: string[] = Array.isArray(json?.data)
        ? json.data.map((m: any) => String(m?.id || '')).filter(Boolean).sort()
        : [];
      if (!models.length) throw new BadRequestException('接口已连通，但未返回任何模型（data 为空）');
      return { ok: true, models };
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      if (e?.name === 'AbortError') {
        throw new BadRequestException('连接超时（15s），请检查 Base URL 是否正确');
      }
      throw new BadRequestException(`连接失败：${e?.message || e}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
