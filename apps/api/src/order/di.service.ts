import { BadGatewayException, BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditRepo, QuotesRepo } from '../common/mock-db';
import { AiNcmService } from './ai-ncm.service';
import { calculateDi, DiParameters } from './di-calculation';
import { QuoteService } from '../upload/quote.service';

@Injectable()
export class DiService {
  constructor(
    @Inject('QuotesRepo') private readonly quotesRepo: QuotesRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo,
    private readonly ai: AiNcmService,
    private readonly quoteService: QuoteService
  ) {}

  async analyze(id: string, parameters: DiParameters, actor: { username: string; role: string }) {
    const order: any = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (!Array.isArray(order.line_items) || order.line_items.length === 0) {
      throw new BadRequestException('O pedido não possui produtos para análise de NCM');
    }
    const suggestions = await this.ai.suggest(order);
    for (const item of suggestions) {
      if (!item.sources.length) throw new BadGatewayException(`A IA não forneceu fonte oficial para a linha ${item.row_no}`);
    }
    const analysis = calculateDi(order, suggestions, parameters);
    const saved = await this.quotesRepo.update(id, { di_analysis: analysis } as any);
    await this.auditRepo.entry({
      actor_username: actor.username, actor_role: actor.role, action: 'order.di.analyze',
      target_type: 'quote', target_id: id,
      detail: { quote_no: order.quote_no, items: analysis.items.length, total_di_brl: analysis.totals.di_brl }
    });
    return saved?.di_analysis || analysis;
  }

  async review(id: string, body: { parameters: DiParameters; items: any[] }, actor: { username: string; role: string }) {
    const order: any = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (!order.di_analysis) throw new BadRequestException('Execute a análise de NCM antes de confirmar a DI');
    if (!Array.isArray(body.items)) throw new BadRequestException('Itens da DI não informados');
    const current = new Map((order.di_analysis.items || []).map((item: any) => [Number(item.row_no), item]));
    const suggestions = body.items.map((item: any) => ({ ...(current.get(Number(item.row_no)) || {}), ...item }));
    const analysis = calculateDi(order, suggestions, body.parameters);
    const versions = Array.isArray(order.di_review_versions) ? order.di_review_versions : [];
    const version = versions.reduce((max: number, item: any) => Math.max(max, Number(item.version) || 0), 0) + 1;
    const reviewedAt = new Date().toISOString();
    analysis.status = 'reviewed';
    analysis.created_at = order.di_analysis.created_at;
    (analysis as any).reviewed_by = actor.username;
    (analysis as any).reviewed_at = reviewedAt;
    (analysis as any).review_version = version;
    const snapshot = {
      version,
      reviewed_by: actor.username,
      reviewed_at: reviewedAt,
      analysis: JSON.parse(JSON.stringify(analysis))
    };
    const saved = await this.quotesRepo.update(id, {
      di_analysis: analysis,
      di_review_versions: [...versions, snapshot]
    } as any);
    await this.auditRepo.entry({
      actor_username: actor.username, actor_role: actor.role, action: 'order.di.review',
      target_type: 'quote', target_id: id,
      detail: { quote_no: order.quote_no, version, total_di_brl: analysis.totals.di_brl }
    });
    return saved?.di_analysis || analysis;
  }

  async listVersions(id: string) {
    const order: any = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return Array.isArray(order.di_review_versions) ? order.di_review_versions : [];
  }

  async getVersion(id: string, value: string) {
    const version = Number(value);
    if (!Number.isInteger(version) || version < 1) throw new BadRequestException('Versão da DI inválida');
    const versions = await this.listVersions(id);
    const snapshot = versions.find((item: any) => Number(item.version) === version);
    if (!snapshot) throw new NotFoundException('Versão da DI não encontrada');
    return snapshot;
  }

  async generateDdp(id: string, actor: { username: string; role: string }) {
    const order: any = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (!order.di_analysis) throw new BadRequestException('Execute a análise de NCM/DI antes de gerar o DDP');
    if (order.di_analysis.status !== 'reviewed') {
      throw new BadRequestException('Confirme a revisão da DI antes de gerar o DDP');
    }
    const reviewVersion = Number(order.di_analysis.review_version) || null;
    const result = await this.quoteService.computeDdpWithDi(id, order.di_analysis, actor);
    await this.auditRepo.entry({
      actor_username: actor.username, actor_role: actor.role, action: 'order.di.ddp',
      target_type: 'quote', target_id: id,
      detail: {
        quote_no: order.quote_no, di_review_version: reviewVersion,
        merchandise_brl: result.pricing_breakdown?.merchandise_brl,
        di_total_brl: order.di_analysis.totals.di_brl,
        sales_markup_brl: result.pricing_breakdown?.sales_markup_brl,
        tax_base_brl: result.pricing_breakdown?.tax_base_brl,
        sales_tax_brl: result.pricing_breakdown?.sales_tax_brl,
        profit_brl: result.pricing_breakdown?.profit_brl,
        total_brl: result.total_amount_brl, is_reference: true
      }
    });
    return result;
  }
}
