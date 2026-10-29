import {
  BadRequestException, Body, Controller, Get, Inject, Put, Req, UseGuards
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import type { AiConfigRepo, AuditRepo } from '../common/mock-db';

interface AiConfigBody {
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

function pickValues(body: AiConfigBody) {
  const base_url = String(body.base_url ?? '').trim();
  const model = String(body.model ?? '').trim();
  const timeout_ms = Number(body.timeout_ms);
  if (!/^https?:\/\//i.test(base_url)) {
    throw new BadRequestException('Base URL 必须以 http:// 或 https:// 开头');
  }
  if (!model) throw new BadRequestException('模型名称不能为空');
  if (!Number.isFinite(timeout_ms) || timeout_ms < 1000 || timeout_ms > 600000) {
    throw new BadRequestException('超时时间需在 1000–600000 毫秒之间');
  }
  const api_key = typeof body.api_key === 'string' ? body.api_key.trim() : undefined;
  return { base_url, model, timeout_ms, api_key };
}

/**
 * 管理端：AI 模型 API 配置（运行时维护，覆盖环境变量）
 *   GET /api/admin/ai-config → 当前配置（API Key 脱敏）
 *   PUT /api/admin/ai-config → 更新配置；api_key 留空表示保持原值
 */
@Controller('admin/ai-config')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AiConfigController {
  constructor(
    @Inject('AiConfigRepo') private readonly repo: AiConfigRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo
  ) {}

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

  @Put()
  async update(@Body() body: AiConfigBody, @Req() req: Request & { user?: any }) {
    const values = pickValues(body);
    const before = await this.repo.get();
    const row = await this.repo.upsert(values, req.user?.username || 'system');
    await this.auditRepo.entry({
      actor_username: req.user?.username || 'system',
      actor_role: req.user?.role || 'system',
      action: 'ai_config.update',
      target_type: 'ai_config',
      target_id: 'default',
      detail: {
        base_url: row.base_url,
        model: row.model,
        timeout_ms: row.timeout_ms,
        api_key_changed: !!values.api_key,
        before_model: before?.model || null
      }
    });
    return {
      ok: true,
      config: {
        base_url: row.base_url,
        model: row.model,
        timeout_ms: row.timeout_ms,
        has_api_key: !!row.api_key,
        api_key_masked: maskKey(row.api_key),
        updated_by: row.updated_by,
        updated_at: row.updated_at
      }
    };
  }
}
