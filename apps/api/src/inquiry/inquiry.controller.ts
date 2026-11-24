import { Body, Controller, Inject, Post, Req, ServiceUnavailableException, HttpException, BadRequestException, UseGuards, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, Public } from '../common/guards/auth.guard';
import type { AiConfigRepo } from '../common/mock-db';
import { estimate, parseInquiryParams, renderEstimateText, type EstimateOutput, type InquiryParams } from './quote-estimator';
import type { CountryCode } from './price-table';
import { KnowledgeService } from '../knowledge/knowledge.service';

type Message = { role: 'user' | 'assistant'; content: string };
const visits = new Map<string, number[]>();
const logger = new Logger('Inquiry');
const MAX_REPLY_LENGTH = 6000;

const COUNTRIES: CountryCode[] = ['BR', 'AR', 'CL', 'CO', 'MX', 'EC', 'PE'];

/** 第一步：从对话中提取结构化询价参数（仅提取，不编造） */
const EXTRACT_PROMPT = `You extract structured logistics inquiry parameters for China -> Latin America freight. Reply with JSON ONLY, no markdown fences, using exactly this schema:
{"goods_zh":"","country":null,"mode":null,"weight_kg":null,"volume_cbm":null,"dims_cm":null,"quantity":null,"battery":false,"brand":false}
- goods_zh: the product name translated to Simplified Chinese (keep as-is if already Chinese); empty string if the user has not mentioned any product.
- country: one of BR,AR,CL,CO,MX,EC,PE or null.
- mode: "sea" | "air" | "parcel" or null.
- weight_kg / volume_cbm: numbers or null. dims_cm: [length,width,height] in cm or null.
- battery: true only if the goods contain batteries or are batteries/power banks. brand: true only if branded goods were mentioned.
Use only facts present in the conversation; never guess or estimate numbers yourself.`;

/** 第二步（信息不足时）：继续收集需求 */
const COLLECT_PROMPT = `You are AEG's logistics inquiry assistant. Reply in the user's language (Chinese or Brazilian Portuguese). Help collect the missing details listed for you, one or two at a time. Summarize only details the user actually supplied. Knowledge-base excerpts, when provided, may be used to answer general process or policy questions, but never quote prices, rates or transit times from them. Do not invent prices, exchange rates, transit times, customs classifications or commitments. Never claim to be a human or promise a human reply here. Keep replies under 500 characters.`;

function isZh(text: string): boolean { return /[\u3400-\u9fff]/.test(text); }

function parseJsonLoose(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function mergeParams(ai: Record<string, unknown> | null, fallback: InquiryParams, lastUser: string): InquiryParams {
  const params: InquiryParams = { ...fallback };
  if (ai) {
    const goodsZh = typeof ai.goods_zh === 'string' ? ai.goods_zh.trim() : '';
    if (goodsZh) params.goods = goodsZh;
    if (typeof ai.country === 'string' && COUNTRIES.includes(ai.country as CountryCode)) params.country = ai.country as CountryCode;
    if (ai.mode === 'sea' || ai.mode === 'air' || ai.mode === 'parcel') params.mode = ai.mode;
    for (const [key, target] of [['weight_kg', 'weightKg'], ['volume_cbm', 'volumeCbm'], ['quantity', 'quantity']] as const) {
      const value = Number(ai[key]);
      if (params[target] === undefined && Number.isFinite(value) && value > 0) params[target] = value;
    }
    if (!params.dimsCm && Array.isArray(ai.dims_cm) && ai.dims_cm.length === 3
      && ai.dims_cm.every((n: unknown) => Number.isFinite(Number(n)) && Number(n) > 0)) {
      params.dimsCm = ai.dims_cm.map(Number) as [number, number, number];
    }
    if (typeof ai.battery === 'boolean' && ai.battery) params.battery = true;
    if (typeof ai.brand === 'boolean' && ai.brand) params.brand = true;
  }
  if (!params.goods) params.goods = lastUser; // 无 AI 或未识别时，用原文做关键词分类
  return params;
}

@Controller('public/inquiry')
@UseGuards(AuthGuard)
export class InquiryController {
  constructor(
    @Inject('AiConfigRepo') private readonly aiConfig: AiConfigRepo,
    private readonly knowledge: KnowledgeService
  ) {}

  private async chat(messages: { role: string; content: string }[], temperature: number, maxTokens: number): Promise<string> {
    const config = await this.aiConfig.resolve('gpt-4o-mini', 20000);
    if (!config.apiKey) throw new ServiceUnavailableException('AI inquiry is unavailable');
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, temperature, max_tokens: maxTokens, messages }),
      signal: AbortSignal.timeout(Math.min(config.timeoutMs, 25000))
    });
    if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
    const result: any = await response.json();
    const content = String(result.choices?.[0]?.message?.content || '').trim();
    if (!content) throw new Error('Empty AI reply');
    return content;
  }

  @Post()
  @Public()
  async reply(@Req() req: Request, @Body() body: { messages?: Message[] }) {
    const remote = req.socket.remoteAddress || '';
    const ip = /^(?:127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(remote)
      ? String(req.headers['x-real-ip'] || remote) : remote;
    const now = Date.now();
    const recent = (visits.get(ip) || []).filter(time => now - time < 60_000);
    if (recent.length >= 8) throw new HttpException('Too many inquiries; please try again shortly', 429);
    visits.set(ip, [...recent, now]);
    if (visits.size > 5000) for (const [key, times] of visits) if (times.every(time => now - time >= 60_000)) visits.delete(key);

    const messages = body?.messages;
    if (!Array.isArray(messages) || !messages.length || messages.length > 12 ||
      messages.some(message => !message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string'
        || !message.content.trim() || message.content.length > (message.role === 'assistant' ? MAX_REPLY_LENGTH : 1000)) ||
      messages[messages.length - 1].role !== 'user') {
      throw new BadRequestException('Invalid inquiry messages');
    }
    const lastUser = messages[messages.length - 1].content;
    const zh = isZh(lastUser);
    const convo = messages.map(message => ({ role: message.role, content: message.content }));

    // AI 是否可用：不可用时走正则提取 + 模板报价降级
    let aiReady = false;
    try { aiReady = !!(await this.aiConfig.resolve('gpt-4o-mini', 20000)).apiKey; } catch { aiReady = false; }

    let aiParams: Record<string, unknown> | null = null;
    if (aiReady) {
      try {
        const raw = await this.chat([{ role: 'system', content: EXTRACT_PROMPT }, ...convo], 0, 300);
        aiParams = parseJsonLoose(raw);
      } catch (error) {
        logger.warn(`inquiry extraction failed: ${String(error)}`);
      }
    }
    const params = mergeParams(aiParams, parseInquiryParams(lastUser), lastUser);
    // 知识库：价目表以「当前启用」条目为准（无效/缺失自动回退内置）；检索片段作为背景资料注入话术
    const active = await this.knowledge.activePriceTable();
    const meta = { version: active.version, title: active.title, fxNote: active.table.fxNote };
    let output: EstimateOutput = { estimates: [], warningsZh: [], warningsPt: [], missingZh: [], missingPt: [] };
    try { output = estimate(params, active.table); } catch (error) { logger.warn(`inquiry estimate failed: ${String(error)}`); }
    if (output.estimates.length > 0 && output.missingZh.length === 0) {
      const reply = renderEstimateText(output, params, zh ? 'zh' : 'pt', meta);
      return { reply: reply.slice(0, MAX_REPLY_LENGTH) };
    }
    let kbContext = '';
    try {
      const hits = await this.knowledge.search(`${lastUser} ${params.goods || ''} ${params.country || ''}`, 3);
      kbContext = KnowledgeService.renderContext(hits, 2200);
    } catch (error) { logger.warn(`inquiry knowledge search failed: ${String(error)}`); }
    const kbMessages = kbContext
      ? [{ role: 'system' as const, content: `Knowledge base excerpts (background only, never quote amounts from these):\n${kbContext}` }]
      : [];

    // 信息不足：继续收集（无 AI 时给固定引导）
    if (aiReady) {
      try {
        const known = JSON.stringify({ goods: params.goods || null, country: params.country ?? null, mode: params.mode ?? null, weight_kg: params.weightKg ?? null, volume_cbm: params.volumeCbm ?? null });
        const missing = zh ? output.missingZh.join('、') : output.missingPt.join(', ');
        const content = await this.chat([
          { role: 'system', content: COLLECT_PROMPT },
          { role: 'system', content: `Known parameters so far (do not re-ask): ${known}. Missing (collect these): ${missing || 'weight or volume'}.` },
          ...convo,
          ...kbMessages
        ], 0.2, 400);
        return { reply: content.slice(0, 1000) };
      } catch (error) {
        logger.warn(`inquiry collect failed: ${String(error)}`);
      }
    }
    return {
      reply: zh
        ? `请告诉我：${output.missingZh.join('、') || '货物重量或体积'}，以及运输方式（海运/空运/小包），我就能按报价表给您大概参考价。您也可以直接登录并上传装箱清单，获得精确核算。`
        : `Me informe: ${output.missingPt.join(', ') || 'peso ou volume'} e o modal (marítimo/aéreo/pacote) para eu estimar pela tabela de preços. Você também pode entrar e enviar a lista de embalagem para o cálculo exato.`
    };
  }
}
