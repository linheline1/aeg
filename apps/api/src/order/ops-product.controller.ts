import {
  BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query, Req, UseGuards
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import type { ProductCatalogRepo, QuotesRepo, ImageRepo, AuditRepo, ProductCatalogRow } from '../common/mock-db';

/**
 * 运营端：产品档案（按 SKU 归档历史订单产品的品名、原单价、NCM 与图片）
 *   GET    /api/ops/products?q=&page=&pageSize= → 分页列表（q 匹配 SKU/品名/NCM）
 *   PATCH  /api/ops/products/:id → 编辑品名/原单价/NCM（人工改 NCM 记为已核验）
 *   POST   /api/ops/products/sync → 扫描全部报价订单，按 SKU 归档产品信息与行图片
 */
@Controller('ops/products')
@UseGuards(AuthGuard, RolesGuard)
@Roles('operator', 'admin')
export class OpsProductController {
  constructor(
    @Inject('ProductCatalogRepo') private readonly products: ProductCatalogRepo,
    @Inject('QuotesRepo') private readonly quotes: QuotesRepo,
    @Inject('ImageRepo') private readonly images: ImageRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo
  ) {}

  private async audit(req: Request & { user?: any }, action: string, detail: Record<string, unknown>) {
    await this.auditRepo.entry({
      actor_username: req.user?.username || 'system',
      actor_role: req.user?.role || 'system',
      action,
      target_type: 'product',
      target_id: String(detail.sku || ''),
      detail
    });
  }

  @Get()
  async list(@Query('q') q?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.products.list({
      q: q || undefined,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    const before = await this.products.findById(id);
    if (!before) throw new NotFoundException('产品不存在或已被删除');

    const patch: Partial<ProductCatalogRow> = {};
    if (typeof body.product_cn === 'string') patch.product_cn = body.product_cn.trim() || null;
    if (typeof body.product_en === 'string') patch.product_en = body.product_en.trim() || null;
    if (body.base_unit_price_rmb !== undefined) {
      const price = body.base_unit_price_rmb == null ? null : Number(body.base_unit_price_rmb);
      if (price != null && (!Number.isFinite(price) || price <= 0)) {
        throw new BadRequestException('原单价必须为空或大于 0 的数字');
      }
      patch.base_unit_price_rmb = price;
    }
    if (body.ncm !== undefined) {
      const ncm = String(body.ncm || '').trim();
      if (ncm && !/^\d{8}$/.test(ncm)) throw new BadRequestException('NCM 必须为空或 8 位数字');
      patch.ncm = ncm || null;
      // 人工改过 NCM → 记为已核验；清空 NCM → 撤销核验标记
      if (ncm !== (before.ncm || '')) {
        patch.ncm_reviewed_by = ncm ? (req.user?.username || 'system') : null;
        patch.ncm_reviewed_at = ncm ? new Date().toISOString() : null;
      }
    }

    const row = await this.products.update(id, patch);
    if (!row) throw new NotFoundException('产品不存在或已被删除');
    await this.audit(req, 'product.update', {
      sku: row.sku,
      before_ncm: before.ncm,
      ncm: row.ncm,
      price_changed: row.base_unit_price_rmb !== before.base_unit_price_rmb,
      name_changed: row.product_cn !== before.product_cn || row.product_en !== before.product_en
    });
    return row;
  }

  /**
   * 同步历史订单：遍历全部报价单的产品行，按 SKU 归档
   * 品名/原单价取自订单行；NCM 取行上的 ncm，否则回退 DI 分析结果；
   * 图片按 quote_id + row_no 关联合并到产品；人工已核验的 NCM/字段不被覆盖
   */
  @Post('sync')
  async sync(@Req() req: Request & { user?: any }) {
    const quotes = await this.quotes.find();
    // 有效图片 id 集合：档案中引用的图片若已被删（如重新提取），合并时自动剔除
    const allImages = await this.images.findAll();
    const validImageIds = new Set(allImages.map(img => img.id));
    let synced = 0;

    for (const quote of quotes) {
      const items = (quote as any).line_items;
      if (!Array.isArray(items) || items.length === 0) continue;

      const orderImages = await this.images.findAll({ quote_id: quote.id });
      const diByRow = new Map<number, any>(
        (((quote as any).di_analysis?.items) || []).map((it: any) => [Number(it.row_no), it])
      );

      for (const item of items) {
        const sku = String(item?.sku || '').trim();
        if (!sku) continue; // 无 SKU 的行无法归档
        const rowNo = Number(item.row_no);

        const existing = await this.products.findBySku(sku);
        const ncm = String(item.ncm || diByRow.get(rowNo)?.ncm || '').replace(/\D/g, '').slice(0, 8) || null;
        const rowImageIds = orderImages
          .filter(img => Number(img.row_no) === rowNo)
          .map(img => img.id);

        await this.products.upsertBySku(sku, {
          sku,
          product_cn: item.product_cn || existing?.product_cn || null,
          product_en: item.product_en || existing?.product_en || null,
          description: item.description || existing?.description || null,
          material: item.material || existing?.material || null,
          base_unit_price_rmb: Number(item.unit_price) > 0 ? Number(item.unit_price) : (existing?.base_unit_price_rmb ?? null),
          // 未核验过 NCM 才允许同步填充；人工核验后同步不再覆盖
          ncm: existing?.ncm_reviewed_at ? existing.ncm : (ncm || existing?.ncm || null),
          ncm_confidence: existing?.ncm_confidence ?? null,
          ncm_sources: existing?.ncm_sources || [],
          image_ids: Array.from(new Set([
            ...(existing?.image_ids || []).filter((id: string) => validImageIds.has(id)),
            ...rowImageIds
          ])),
          last_quote_id: quote.id,
          last_client_id: quote.client_id
        });
        synced++;
      }
    }

    const all = await this.products.list({ page: 1, pageSize: 100 });
    await this.audit(req, 'product.sync', { synced_rows: synced, total_products: all.total });
    return { ok: true, synced, total: all.total };
  }
}
