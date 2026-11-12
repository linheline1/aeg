import {
  Body, Controller, Delete, Get, Inject, NotFoundException, Param, Put, Req, UseGuards
} from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, RolesGuard, Roles } from '../common/guards/auth.guard';
import { AuditRepo, ClientRepo, FeeRatesRepo } from '../common/mock-db';
import { assertValidRates } from '../common/rates-validation';
import { DEFAULT_PROFIT_BRL, DEFAULT_SALES_MARKUP_RATE, DEFAULT_SALES_TAX_RATE } from '../upload/ddp-pricing';

interface RatesBody {
  ocean_freight_usd?: number;
  port_fee_usd?: number;
  br_trucking_brl?: number;
  br_clearance_brl?: number;
  fx_rate?: number;
  sales_tax_rate?: number;
  sales_markup_rate?: number;
  profit_brl?: number;
}

function pickRates(body: RatesBody) {
  const values = {
    ocean_freight_usd: Number(body.ocean_freight_usd),
    port_fee_usd: Number(body.port_fee_usd),
    br_trucking_brl: Number(body.br_trucking_brl ?? 0),
    br_clearance_brl: Number(body.br_clearance_brl ?? 0),
    fx_rate: Number(body.fx_rate),
    sales_tax_rate: body.sales_tax_rate === undefined ? DEFAULT_SALES_TAX_RATE : Number(body.sales_tax_rate),
    sales_markup_rate: body.sales_markup_rate === undefined ? DEFAULT_SALES_MARKUP_RATE : Number(body.sales_markup_rate),
    profit_brl: body.profit_brl === undefined ? DEFAULT_PROFIT_BRL : Number(body.profit_brl)
  };
  assertValidRates(values);
  return values;
}

/**
 * 运营端费率表（M2）
 *   GET    /api/ops/rates                  → 全局默认 + 客户覆盖 + 客户下拉
 *   PUT    /api/ops/rates/global           → 更新全局默认
 *   PUT    /api/ops/rates/client/:clientId → 设置客户覆盖
 *   DELETE /api/ops/rates/client/:clientId → 移除客户覆盖
 *   GET    /api/ops/rates/resolve/:clientId → 解析结果预览（覆盖 > 全局）
 * 所有变更写审计日志。
 */
@Controller('ops/rates')
@UseGuards(AuthGuard, RolesGuard)
@Roles('operator', 'admin')
export class RatesController {
  constructor(
    @Inject('FeeRatesRepo') private readonly feeRatesRepo: FeeRatesRepo,
    @Inject('ClientRepo') private readonly clientsRepo: ClientRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo
  ) {}

  private actor(req: Request & { user?: any }) {
    return { actor_username: req.user?.username || 'system', actor_role: req.user?.role || 'system' };
  }

  @Get()
  async all() {
    const [rows, clients] = await Promise.all([this.feeRatesRepo.findAll(), this.clientsRepo.findAll()]);
    const global = rows.find(r => r.scope === 'global') || null;
    const nameOf = new Map(clients.map(c => [c.id, c.name]));
    const overrides = rows
      .filter(r => r.scope === 'client')
      .map(r => ({ ...r, client_name: nameOf.get(r.client_id!) || r.client_id || '' }))
      .sort((a, b) => a.client_name.localeCompare(b.client_name));
    return { global, overrides, clients: clients.map(c => ({ id: c.id, name: c.name, status: c.status })) };
  }

  @Put('global')
  async updateGlobal(@Body() body: RatesBody, @Req() req: Request & { user?: any }) {
    const values = pickRates(body);
    const before = await this.feeRatesRepo.findGlobal();
    const row = await this.feeRatesRepo.upsertGlobal(values, req.user?.username || 'system');
    await this.auditRepo.entry({
      ...this.actor(req),
      action: 'rates.global.update',
      target_type: 'fee_rates',
      target_id: row.id,
      detail: {
        before: before && {
          ocean: before.ocean_freight_usd, port: before.port_fee_usd, truck: before.br_trucking_brl, fx: before.fx_rate,
          sales_tax_rate: before.sales_tax_rate, sales_markup_rate: before.sales_markup_rate, profit_brl: before.profit_brl
        },
        after: {
          ocean: values.ocean_freight_usd, port: values.port_fee_usd, truck: values.br_trucking_brl, fx: values.fx_rate,
          sales_tax_rate: values.sales_tax_rate, sales_markup_rate: values.sales_markup_rate, profit_brl: values.profit_brl
        }
      }
    });
    return { ok: true, global: row };
  }

  @Put('client/:clientId')
  async upsertClient(@Param('clientId') clientId: string, @Body() body: RatesBody, @Req() req: Request & { user?: any }) {
    const client = await this.clientsRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('客户不存在');
    const values = pickRates(body);
    const before = await this.feeRatesRepo.findClient(clientId);
    const row = await this.feeRatesRepo.upsertClient(clientId, values, req.user?.username || 'system');
    await this.auditRepo.entry({
      ...this.actor(req),
      action: before ? 'rates.client.update' : 'rates.client.set',
      target_type: 'fee_rates',
      target_id: clientId,
      detail: {
        client_name: client.name,
        before: before && {
          ocean: before.ocean_freight_usd, port: before.port_fee_usd, truck: before.br_trucking_brl, fx: before.fx_rate,
          sales_tax_rate: before.sales_tax_rate, sales_markup_rate: before.sales_markup_rate, profit_brl: before.profit_brl
        },
        after: {
          ocean: values.ocean_freight_usd, port: values.port_fee_usd, truck: values.br_trucking_brl, fx: values.fx_rate,
          sales_tax_rate: values.sales_tax_rate, sales_markup_rate: values.sales_markup_rate, profit_brl: values.profit_brl
        }
      }
    });
    return { ok: true, override: { ...row, client_name: client.name } };
  }

  @Delete('client/:clientId')
  async removeClient(@Param('clientId') clientId: string, @Req() req: Request & { user?: any }) {
    const client = await this.clientsRepo.findOne({ where: { id: clientId } });
    const removed = await this.feeRatesRepo.deleteClient(clientId);
    if (!removed) throw new NotFoundException('该客户没有费率覆盖');
    await this.auditRepo.entry({
      ...this.actor(req),
      action: 'rates.client.remove',
      target_type: 'fee_rates',
      target_id: clientId,
      detail: { client_name: client?.name || clientId }
    });
    return { ok: true };
  }

  @Get('resolve/:clientId')
  async resolve(@Param('clientId') clientId: string) {
    const client = await this.clientsRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('客户不存在');
    const r = await this.feeRatesRepo.resolve(clientId);
    return { client_id: clientId, client_name: client.name, ...r };
  }
}
