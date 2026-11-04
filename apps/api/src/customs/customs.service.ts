import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { AuditRepo, ImageRepo, QuotesRepo } from '../common/mock-db';
import { DiService } from '../order/di.service';
import { AiNcmService } from '../order/ai-ncm.service';
import { DiParameters } from '../order/di-calculation';

const PROGRESS_STAGES = ['customs_br', 'duty_paid', 'cleared'] as const;

function latestShipmentStage(shipment: any): string | null {
  if (!Array.isArray(shipment?.events) || shipment.events.length === 0) return null;
  const events = [...shipment.events].sort((a, b) => String(a.happened_at).localeCompare(String(b.happened_at)));
  return events[events.length - 1]?.stage || null;
}

function publicReview(review: any) {
  if (!review) return null;
  return {
    status: review.status || 'pending',
    di_review_version: review.di_review_version ?? null,
    total_di_brl: review.total_di_brl ?? null,
    note: review.note || null,
    reviewed_by: review.reviewed_by || null,
    reviewed_at: review.reviewed_at || null
  };
}

@Injectable()
export class CustomsService {
  constructor(
    @Inject('QuotesRepo') private readonly quotesRepo: QuotesRepo,
    @Inject('ImageRepo') private readonly imageRepo: ImageRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo,
    private readonly diService: DiService,
    private readonly aiNcm: AiNcmService
  ) {}

  private async order(id: string): Promise<any> {
    const order = await this.quotesRepo.findById(id);
    if (!order) throw new NotFoundException('Pedido não encontrado');
    return order;
  }

  private listItem(order: any) {
    return {
      id: order.id,
      quote_no: order.quote_no,
      status: order.status,
      total_cbm: order.total_cbm ?? null,
      total_gw_kg: order.total_gw_kg ?? null,
      total_amount_rmb: order.total_amount_rmb ?? null,
      total_amount_brl: order.total_amount_brl ?? null,
      di_total_brl: Number.isFinite(Number(order.di_analysis?.totals?.di_brl))
        ? Number(order.di_analysis.totals.di_brl) : null,
      customs_review: publicReview(order.customs_review),
      shipment_stage: latestShipmentStage(order.shipment),
      created_at: order.created_at,
      updated_at: order.updated_at
    };
  }

  async home() {
    const orders: any[] = await this.quotesRepo.find();
    const reviewStatus = (order: any) => order.customs_review?.status || 'pending';
    const latest = (order: any) => latestShipmentStage(order.shipment);
    const recent = orders
      .filter(order => reviewStatus(order) !== 'approved')
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 6)
      .map(order => this.listItem(order));
    return {
      counts: {
        pending: orders.filter(order => reviewStatus(order) === 'pending').length,
        approved: orders.filter(order => reviewStatus(order) === 'approved').length,
        changes_requested: orders.filter(order => reviewStatus(order) === 'changes_requested').length,
        customs_in_progress: orders.filter(order => ['customs_br', 'duty_paid'].includes(latest(order) || '')).length,
        cleared: orders.filter(order => latest(order) === 'cleared').length
      },
      recent
    };
  }

  async list(query: { status?: string; q?: string; page?: string; pageSize?: string }) {
    const keyword = (query.q || '').trim().toLowerCase();
    const status = (query.status || '').trim();
    if (status && !['pending', 'approved', 'changes_requested'].includes(status)) {
      throw new BadRequestException('Status de revisão inválido');
    }
    let orders: any[] = await this.quotesRepo.find();
    if (status) orders = orders.filter(order => (order.customs_review?.status || 'pending') === status);
    if (keyword) orders = orders.filter(order => String(order.quote_no).toLowerCase().includes(keyword));
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    return {
      items: orders.slice((page - 1) * pageSize, page * pageSize).map(order => this.listItem(order)),
      total: orders.length,
      page,
      pageSize
    };
  }

  async detail(id: string) {
    const order = await this.order(id);
    const images = await this.imageRepo.findByQuote(id);
    return {
      ...this.listItem(order),
      total_rows: order.total_rows ?? null,
      valid_rows: order.valid_rows ?? null,
      invoice_cnpj: order.invoice_cnpj ? {
        cnpj: order.invoice_cnpj.cnpj,
        company_name: order.invoice_cnpj.company_name,
        ie: order.invoice_cnpj.ie || null
      } : null,
      line_items: (order.line_items || []).map((item: any) => ({
        row_no: item.row_no,
        carton_no: item.carton_no ?? null,
        sku: item.sku ?? null,
        product_cn: item.product_cn ?? null,
        product_en: item.product_en ?? null,
        brand: item.brand ?? null,
        hs_code: item.hs_code ?? null,
        cartons: item.cartons ?? null,
        pcs_per_carton: item.pcs_per_carton ?? null,
        total_pcs: item.total_pcs ?? null,
        total_gw: item.total_gw ?? null,
        total_cbm: item.total_cbm ?? null,
        unit_price: item.unit_price ?? null,
        total_price: item.total_price ?? null,
        material: item.material ?? null
      })),
      di_analysis: order.di_analysis || null,
      shipment: order.shipment ? {
        events: (order.shipment.events || []).map((event: any) => ({
          id: event.id,
          stage: event.stage,
          note: event.note || null,
          happened_at: event.happened_at,
          created_by: event.created_by || null
        }))
      } : null,
      images: images.map(image => ({
        id: image.id,
        row_no: image.row_no ?? null,
        file_name: `imagem-${image.row_no || 'pedido'}-${image.id.slice(0, 8)}`,
        mime_type: image.mime_type,
        size_bytes: image.size_bytes,
        created_at: image.created_at
      }))
    };
  }

  async analyze(id: string, parameters: DiParameters, actor: { username: string; role: string }) {
    return this.diService.analyze(id, parameters, actor);
  }

  async review(id: string, body: { parameters: DiParameters; items: any[]; additional_fees?: any[]; note?: string }, actor: { username: string; role: string }) {
    if (body.note !== undefined && String(body.note).length > 500) {
      throw new BadRequestException('A observação deve ter no máximo 500 caracteres');
    }
    const analysis: any = await this.diService.review(id, body, actor);
    const reviewedAt = new Date().toISOString();
    await this.quotesRepo.update(id, {
      customs_review: {
        status: 'approved',
        di_review_version: Number(analysis.review_version),
        total_di_brl: Number(analysis.totals.di_brl),
        note: body.note?.trim() || null,
        reviewed_by: actor.username,
        reviewed_at: reviewedAt
      }
    } as any);
    await this.auditRepo.entry({
      actor_username: actor.username,
      actor_role: actor.role,
      action: 'customs.order.approve',
      target_type: 'quote',
      target_id: id,
      detail: { di_review_version: analysis.review_version, total_di_brl: analysis.totals.di_brl }
    });
    return analysis;
  }

  async requestChanges(id: string, note: string, actor: { username: string; role: string }) {
    const order = await this.order(id);
    const text = String(note || '').trim();
    if (!text) throw new BadRequestException('Descreva as correções necessárias');
    if (text.length > 500) throw new BadRequestException('A observação deve ter no máximo 500 caracteres');
    const review = {
      status: 'changes_requested' as const,
      di_review_version: order.di_analysis?.review_version || null,
      total_di_brl: order.di_analysis?.totals?.di_brl ?? null,
      note: text,
      reviewed_by: actor.username,
      reviewed_at: new Date().toISOString()
    };
    await this.quotesRepo.update(id, { customs_review: review } as any);
    await this.auditRepo.entry({
      actor_username: actor.username,
      actor_role: actor.role,
      action: 'customs.order.request_changes',
      target_type: 'quote',
      target_id: id,
      detail: { quote_no: order.quote_no, note: text }
    });
    return review;
  }

  listVersions(id: string) {
    return this.diService.listVersions(id);
  }

  async translateProducts(id: string, actor: { username: string; role: string }) {
    const order = await this.order(id);
    if (!Array.isArray(order.line_items) || order.line_items.length === 0) {
      throw new BadRequestException('O pedido não possui produtos para traduzir');
    }
    const translations = await this.aiNcm.translateProducts(order.line_items);
    const byRow = new Map(translations.map(item => [item.row_no, item.product_en]));
    const lineItems = order.line_items.map((item: any) => ({
      ...item,
      product_en: byRow.get(Number(item.row_no)) || item.product_en
    }));
    const diAnalysis = order.di_analysis ? {
      ...order.di_analysis,
      items: (order.di_analysis.items || []).map((item: any) => ({
        ...item,
        product_en: byRow.get(Number(item.row_no)) || item.product_en
      }))
    } : null;
    await this.quotesRepo.update(id, { line_items: lineItems, di_analysis: diAnalysis } as any);
    await this.auditRepo.entry({
      actor_username: actor.username,
      actor_role: actor.role,
      action: 'customs.order.translate_products',
      target_type: 'quote',
      target_id: id,
      detail: { quote_no: order.quote_no, count: translations.length }
    });
    return this.detail(id);
  }

  async addProgress(id: string, body: { stage?: string; note?: string; happened_at?: string }, actor: { username: string; role: string }) {
    const order = await this.order(id);
    if (order.status !== 'done') throw new BadRequestException('O pedido ainda não está liberado para desembaraço');
    if (!body.stage || !PROGRESS_STAGES.includes(body.stage as any)) {
      throw new BadRequestException('Etapa inválida. Use customs_br, duty_paid ou cleared');
    }
    const note = String(body.note || '').trim();
    if (note.length > 500) throw new BadRequestException('A observação deve ter no máximo 500 caracteres');
    if (body.happened_at && !Number.isFinite(Date.parse(body.happened_at))) {
      throw new BadRequestException('Data da etapa inválida');
    }
    const now = new Date().toISOString();
    const event = {
      id: crypto.randomUUID(),
      stage: body.stage,
      note: note || null,
      happened_at: body.happened_at || now,
      created_by: actor.username,
      created_at: now
    };
    const events = [...(order.shipment?.events || []), event]
      .sort((a, b) => String(a.happened_at).localeCompare(String(b.happened_at)));
    const shipment = {
      ...(order.shipment || { events: [] }),
      events,
      updated_by: actor.username,
      updated_at: now
    };
    await this.quotesRepo.update(id, { shipment } as any);
    await this.auditRepo.entry({
      actor_username: actor.username,
      actor_role: actor.role,
      action: 'customs.order.progress',
      target_type: 'quote',
      target_id: id,
      detail: { quote_no: order.quote_no, stage: body.stage, happened_at: event.happened_at }
    });
    return { ok: true, event, shipment };
  }
}
