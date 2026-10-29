import { BadGatewayException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { AiConfigRepo } from '../common/mock-db';

@Injectable()
export class AiNcmService {
  constructor(@Inject('AiConfigRepo') private readonly aiConfig: AiConfigRepo) {}

  async suggest(order: any): Promise<any[]> {
    const cfg = await this.aiConfig.resolve('deepseek-flash', 60000);
    if (!cfg.apiKey) {
      throw new ServiceUnavailableException('IA de NCM não configurada. Configure a API do modelo em 管理端 → 模型 API.');
    }
    const { baseUrl, apiKey, model, timeoutMs } = cfg;
    const products = order.line_items.map((row: any) => ({
      row_no: row.row_no, sku: row.sku, product_cn: row.product_cn, product_en: row.product_en,
      description: row.description, material: row.material, current_hs_code: row.hs_code
    }));
    const prompt = `Classifique os produtos importados da China ao Brasil. Pesquise na internet, priorizando Receita Federal, CLASSIF, TEC/NCM, TIPI e legislação oficial. Não invente fontes nem alíquotas.\n` +
      `Retorne APENAS um objeto JSON {"items":[...]}, um item por row_no, com: row_no (número), ncm (8 dígitos), confidence (0 a 1), rationale (justificativa curta), ii_rate, ipi_rate, pis_rate, cofins_rate (FRAÇÕES decimais, ex.: 0.14 para 14%), sources (array de URLs oficiais .gov.br que comprovem NCM/alíquota).\n` +
      `Se não encontrar evidência suficiente, use confidence baixa e explique. Produtos:\n${JSON.stringify(products)}`;
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
    const payload: any = await response.json();
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
      ncm: String(item.ncm || '').replace(/\D/g, ''),
      confidence: Number(item.confidence) || 0,
      rationale: String(item.rationale || ''),
      ii_rate: item.ii_rate,
      ipi_rate: item.ipi_rate,
      pis_rate: item.pis_rate,
      cofins_rate: item.cofins_rate,
      sources: this.officialSources(item.sources)
    }));
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
