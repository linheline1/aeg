import { BadGatewayException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { AiConfigRepo, ImageRepo, ResolvedAiConfig } from '../common/mock-db';
import { repoRoot } from '../common/mock-db';

@Injectable()
export class AiNcmService {
  private readonly logger = new Logger(AiNcmService.name);

  constructor(
    @Inject('AiConfigRepo') private readonly aiConfig: AiConfigRepo,
    @Inject('ImageRepo') private readonly imageRepo: ImageRepo
  ) {}

  async suggest(order: any): Promise<any[]> {
    const cfg = await this.aiConfig.resolve('deepseek-flash', 60000);
    if (!cfg.apiKey) {
      throw new ServiceUnavailableException('IA de NCM não configurada. Configure a API do modelo em 管理端 → 模型 API.');
    }
    const { baseUrl, apiKey, model, timeoutMs } = cfg;
    const orderImages = order.id ? await this.imageRepo.findAll({ quote_id: order.id }) : [];
    const products = await Promise.all(order.line_items.map(async (row: any) => {
      const images = orderImages.filter(image => Number(image.row_no) === Number(row.row_no)).slice(0, 2);
      const visualDescription = images.length ? await this.describeProductImages(images, cfg) : '';
      return {
        row_no: row.row_no, sku: row.sku, product_cn: row.product_cn, product_en: row.product_en,
        description: row.description, material: row.material, current_hs_code: row.hs_code,
        visual_description: visualDescription
      };
    }));
    const prompt = `Classifique os produtos importados da China ao Brasil. Pesquise na internet, priorizando Receita Federal, CLASSIF, TEC/NCM, TIPI e legislação oficial. Não invente fontes nem alíquotas. Quando visual_description estiver presente, use-a como evidência complementar do nome do produto, sem substituir a legislação oficial.\n` +
      `Retorne APENAS um objeto JSON {"items":[...]}, um item por row_no, com: row_no (número), ncm (8 dígitos), confidence (0 a 1), rationale (justificativa curta), ii_rate, ipi_rate, pis_rate, cofins_rate (FRAÇÕES decimais, ex.: 0.14 para 14%), sources (array de URLs oficiais .gov.br que comprovem NCM/alíquota).\n` +
      `Nunca deixe ncm vazio. Sempre retorne o melhor candidato com exatamente 8 dígitos, mesmo quando incerto; nesse caso use confidence baixa (máximo 0.3) e explique a dúvida. Produtos:\n${JSON.stringify(products)}`;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Você é um assistente de classificação fiscal. Responda somente JSON válido com evidência oficial verificável.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          web_search_options: {}
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (e: any) {
      throw new BadGatewayException(`Falha ao consultar a IA de NCM: ${e?.message || 'erro de rede'}`);
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new BadGatewayException(`A IA de NCM retornou HTTP ${response.status}: ${detail}`);
    }
    let payload: any;
    try {
      payload = await response.json();
    } catch (e: any) {
      throw new BadGatewayException(`A resposta da IA de NCM não pôde ser lida (tempo limite de ${Math.round(timeoutMs / 1000)}s?): ${e?.message || e}`);
    }
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new BadGatewayException('A IA não retornou uma análise de NCM');
    let parsed: any;
    try {
      const clean = String(content).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      parsed = JSON.parse(clean);
    } catch {
      throw new BadGatewayException('A IA retornou JSON de NCM inválido');
    }
    if (!Array.isArray(parsed.items)) throw new BadGatewayException('A resposta da IA não contém itens de NCM');
    return parsed.items.map((item: any) => ({
      row_no: Number(item.row_no),
      ncm: (() => {
        const digits = String(item.ncm || '').replace(/\D/g, '');
        return /^\d{10,12}$/.test(digits) ? digits.slice(0, 8) : digits;
      })(),
      confidence: Number(item.confidence) || 0,
      rationale: String(item.rationale || ''),
      ii_rate: item.ii_rate,
      ipi_rate: item.ipi_rate,
      pis_rate: item.pis_rate,
      cofins_rate: item.cofins_rate,
      sources: this.officialSources(item.sources)
    }));
  }

  async translateProducts(lineItems: any[]): Promise<{ row_no: number; product_en: string }[]> {
    if (!Array.isArray(lineItems) || lineItems.length === 0) return [];
    const cfg = await this.aiConfig.resolve('deepseek-flash', 60000);
    if (!cfg.apiKey) {
      throw new ServiceUnavailableException('IA de tradução não configurada. Configure a API do modelo em 管理端 → 模型 API.');
    }
    const { baseUrl, apiKey, model, timeoutMs } = cfg;
    const products = lineItems.map(row => ({
      row_no: Number(row.row_no),
      sku: row.sku || '',
      product_cn: row.product_cn || '',
      product_en: row.product_en || '',
      description: row.description || ''
    }));
    const prompt = `Translate every product description into clear, concise English for Brazilian customs review. ` +
      `Preserve model numbers, sizes, quantities, materials and technical specifications exactly. Do not add or remove products. ` +
      `Return ONLY valid JSON {"items":[{"row_no":number,"product_en":string}]}, one item for each input row_no. ` +
      `The product_en value must be entirely in English, never Chinese or Portuguese. Products:\n${JSON.stringify(products)}`;
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You are a professional customs product translator. Return only valid JSON.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' }
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (e: any) {
      throw new BadGatewayException(`Falha ao consultar a IA de tradução: ${e?.message || 'erro de rede'}`);
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new BadGatewayException(`A IA de tradução retornou HTTP ${response.status}: ${detail}`);
    }
    let payload: any;
    try {
      payload = await response.json();
    } catch (e: any) {
      throw new BadGatewayException(`A resposta da IA de tradução não pôde ser lida (tempo limite de ${Math.round(timeoutMs / 1000)}s?): ${e?.message || e}`);
    }
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new BadGatewayException('A IA não retornou as traduções dos produtos');
    let parsed: any;
    try {
      const clean = String(content).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      parsed = JSON.parse(clean);
    } catch {
      throw new BadGatewayException('A IA retornou JSON de tradução inválido');
    }
    if (!Array.isArray(parsed.items)) throw new BadGatewayException('A resposta da IA não contém os produtos traduzidos');
    const translations = new Map<number, string>(parsed.items.map((item: any) => [Number(item.row_no), String(item.product_en || '').trim()]));
    return lineItems.map(row => {
      const rowNo = Number(row.row_no);
      const productEn = translations.get(rowNo) || '';
      if (!productEn || productEn.length > 500 || /[\u3400-\u9fff]/i.test(productEn)) {
        throw new BadGatewayException(`Tradução inglesa inválida ou ausente para a linha ${rowNo}`);
      }
      return { row_no: rowNo, product_en: productEn };
    });
  }

  private async describeProductImages(images: any[], cfg: ResolvedAiConfig): Promise<string> {
    const content: any[] = [{
      type: 'text',
      text: 'Analyze the product image(s) for Brazilian customs classification. Describe only visible physical characteristics: product type, material, shape, components, electrical parts, battery, screen, motor, packaging and distinguishing features. Do not infer a brand, NCM, price or hidden specifications. Answer in English with at most 80 words.'
    }];
    for (const image of images) {
      try {
        if (Number(image.size_bytes) > 4 * 1024 * 1024) continue;
        const absolute = path.join(repoRoot(), image.file_path);
        const buffer = fs.readFileSync(absolute);
        content.push({
          type: 'image_url',
          image_url: { url: `data:${image.mime_type};base64,${buffer.toString('base64')}` }
        });
      } catch (error: any) {
        this.logger.warn(`Imagem do produto não pôde ser lida: ${error?.message || error}`);
      }
    }
    if (content.length === 1) return '';
    try {
      const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: process.env.AI_VISION_MODEL || 'deepseek-flash',
          messages: [{ role: 'user', content }]
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs)
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw new Error(`HTTP ${response.status}: ${detail}`);
      }
      const payload: any = await response.json();
      return String(payload.choices?.[0]?.message?.content || '').trim().slice(0, 500);
    } catch (error: any) {
      this.logger.warn(`Análise visual DeepSeek falhou; a classificação continuará pelo nome: ${error?.message || error}`);
      return '';
    }
  }

  private officialSources(value: unknown): string[] {
    const sources = Array.isArray(value) ? value.filter((url): url is string => {
      if (typeof url !== 'string') return false;
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && (parsed.hostname === 'gov.br' || parsed.hostname.endsWith('.gov.br'));
      } catch { return false; }
    }).slice(0, 5) : [];
    return sources.length ? sources : ['https://www4.receita.fazenda.gov.br/simulador/'];
  }
}
