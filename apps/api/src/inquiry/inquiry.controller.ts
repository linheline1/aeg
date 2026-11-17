import { Body, Controller, Inject, Post, Req, ServiceUnavailableException, HttpException, BadRequestException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, Public } from '../common/guards/auth.guard';
import type { AiConfigRepo } from '../common/mock-db';

type Message = { role: 'user' | 'assistant'; content: string };
const visits = new Map<string, number[]>();
const instructions = `You are AEG's logistics inquiry assistant. Reply in the user's language (Chinese or Brazilian Portuguese). Help collect product name, quantity or volume, origin in China, and destination in Brazil, one or two missing details at a time. Summarize only details the user actually supplied. Do not invent prices, exchange rates, transit times, customs classifications or commitments. For an amount estimate, direct the user to sign in and upload a packing list through the existing quotation workflow. Never claim to be a human or promise a human reply here. Keep replies under 500 characters.`;

@Controller('public/inquiry')
@UseGuards(AuthGuard)
export class InquiryController {
  constructor(@Inject('AiConfigRepo') private readonly aiConfig: AiConfigRepo) {}

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
      messages.some(message => !message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 1000) ||
      messages[messages.length - 1].role !== 'user') {
      throw new BadRequestException('Invalid inquiry messages');
    }
    const config = await this.aiConfig.resolve('gpt-4o-mini', 20000);
    if (!config.apiKey) throw new ServiceUnavailableException('AI inquiry is unavailable');
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model, temperature: 0.2, max_tokens: 400,
          messages: [{ role: 'system', content: instructions }, ...messages.map(message => ({ role: message.role, content: message.content }))] }),
        signal: AbortSignal.timeout(Math.min(config.timeoutMs, 25000))
      });
      if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
      const result: any = await response.json();
      const content = String(result.choices?.[0]?.message?.content || '').trim().slice(0, 1000);
      if (!content) throw new Error('Empty AI reply');
      // 公开询价只收集需求。模型若输出金额或明确时效，改为固定引导文案。
      const unsafe = /(?:R\$|BRL|USD|CNY|RMB|人民币|雷亚尔|美元|元|块|reais|d[oó]lares)\s*\d|\d[\d.,]*\s*(?:R\$|BRL|USD|CNY|RMB|人民币|雷亚尔|美元|元|块|reais|d[oó]lares|天|日|days|dias)/i.test(content);
      return { reply: unsafe ? (/[\u3400-\u9fff]/.test(messages[messages.length - 1].content)
        ? '请登录并上传装箱清单获取参考预估。您可以先告诉我货物名称、数量、起运地和巴西目的地，我会帮您整理询价需求。'
        : 'Entre e envie sua lista de embalagem para obter uma estimativa de referência. Posso organizar o produto, a quantidade, a origem e o destino no Brasil.') : content };
    } catch {
      throw new ServiceUnavailableException('AI inquiry is temporarily unavailable');
    }
  }
}
