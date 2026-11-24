/**
 * 内部知识库纯函数工具：分词、关键词打分检索、Markdown 切片、价目表校验。
 * 不依赖 Nest / 文件系统，便于 node:test 直接 require dist 测试。
 * 说明：当前大模型供应商（DeepSeek）不提供 embedding，因此采用
 * 「标签 + 中/葡/英关键词打分」做检索，而不是向量检索。
 */

export interface KnowledgeChunk {
  heading: string;
  text: string;
}

export interface SearchDoc {
  id: string;
  title: string;
  tags: string[];
  chunks: KnowledgeChunk[];
}

export interface SearchHit {
  docId: string;
  title: string;
  heading: string;
  text: string;
  score: number;
}

/** 中英文混合分词：拉丁词/数字/渠道代码 + 中文 2-gram 与完整词 */
export function tokenize(text: string): string[] {
  const lower = String(text || '').toLowerCase();
  const tokens = new Set<string>();
  for (const match of lower.matchAll(/[a-zà-ÿ0-9][a-zà-ÿ0-9._-]*/g)) {
    const token = match[0].replace(/^[._-]+|[._-]+$/g, '');
    if (token.length >= 2) tokens.add(token);
  }
  for (const match of lower.matchAll(/[\u3400-\u9fff]+/g)) {
    const phrase = match[0];
    if (phrase.length === 1) tokens.add(phrase);
    for (let i = 0; i < phrase.length - 1; i++) tokens.add(phrase.slice(i, i + 2));
    if (phrase.length >= 3) tokens.add(phrase);
  }
  return [...tokens];
}

function occurrences(haystack: string, needle: string): number {
  let count = 0, from = 0;
  while (needle && (from = haystack.indexOf(needle, from)) >= 0) { count++; from += needle.length; }
  return count;
}

/** 关键词打分：标签 > 标题 > 片段标题 > 正文；长中文词额外加权 */
export function scoreChunks(query: string, docs: SearchDoc[], limit = 4): SearchHit[] {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const hits: SearchHit[] = [];
  for (const doc of docs) {
    const tagText = (doc.tags || []).join(' ').toLowerCase();
    const titleText = String(doc.title || '').toLowerCase();
    for (const chunk of doc.chunks || []) {
      const heading = String(chunk.heading || '').toLowerCase();
      const body = String(chunk.text || '').toLowerCase();
      let score = 0;
      for (const token of tokens) {
        const weight = /[\u3400-\u9fff]/.test(token) && token.length >= 3 ? 2 : 1;
        if (tagText.includes(token)) score += 6 * weight;
        if (titleText.includes(token)) score += 4 * weight;
        if (heading.includes(token)) score += 3 * weight;
        const n = occurrences(body, token);
        if (n) score += Math.min(n, 3) * weight;
      }
      if (score > 0) {
        hits.push({
          docId: doc.id, title: doc.title, heading: chunk.heading,
          text: chunk.text.slice(0, 900), score
        });
      }
    }
  }
  hits.sort((a, b) => b.score - a.score || a.docId.localeCompare(b.docId));
  return hits.slice(0, limit);
}

/** 把 Markdown 按标题切片；超长块再按行二次切分，避免把整篇塞进 prompt */
export function chunksFromMarkdown(markdown: string, fallbackHeading = '全文'): KnowledgeChunk[] {
  const lines = String(markdown || '').split(/\r?\n/);
  const blocks: KnowledgeChunk[] = [];
  let heading = fallbackHeading;
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) blocks.push({ heading, text: text.slice(0, 1600) });
    buffer = [];
  };
  for (const line of lines) {
    const h = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (h) { flush(); heading = h[1].trim(); continue; }
    buffer.push(line);
    if (buffer.join('\n').length >= 1400) flush();
  }
  flush();
  return blocks.length ? blocks : [{ heading: fallbackHeading, text: String(markdown || '').slice(0, 1600) }];
}

/** Excel 单元格值转纯文本（兼容 richText / formula / hyperlink / Date） */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const anyValue = value as any;
    if (Array.isArray(anyValue.richText)) return anyValue.richText.map((part: any) => part.text || '').join('');
    if (typeof anyValue.text === 'string' || typeof anyValue.text === 'number') return String(anyValue.text);
    if (typeof anyValue.result === 'string' || typeof anyValue.result === 'number') return String(anyValue.result);
    if (anyValue instanceof Date) return anyValue.toISOString().slice(0, 10);
    return '';
  }
  return String(value);
}

/** 清洗单元格文本：剔除 WPS 内嵌图片占位公式（=DISPIMG(...)），它们对检索无意义 */
export function cleanCellText(value: unknown): string {
  const text = cellText(value);
  if (!text) return '';
  if (/DISPIMG/i.test(text)) return '';
  return text;
}

/** 宽松校验：挡住明显损坏的价目表，避免计价引擎读到空数据 */
export function validatePriceTable(value: unknown): value is { version: string; channels: any[] } {
  if (!value || typeof value !== 'object') return false;
  const table = value as any;
  if (typeof table.version !== 'string' || !Array.isArray(table.channels) || !table.channels.length) return false;
  return table.channels.every((channel: any) =>
    channel && typeof channel.code === 'string' && typeof channel.country === 'string'
    && ['sea', 'air', 'parcel'].includes(channel.mode)
    && Array.isArray(channel.tiers) && Array.isArray(channel.classes) && channel.rules
  );
}

/** 把结构化价目表拆成按渠道的检索片段，便于「巴西海运费率」这类提问命中 */
export function priceTableChunks(table: any): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];
  for (const channel of table.channels || []) {
    const tiers = (channel.tiers || []).map((tier: any) => tier.label).join(' / ');
    const classes = (channel.classes || []).map((cls: any) =>
      `${cls.name}: ${(cls.prices || []).join(', ')}`).join('; ');
    const text = [
      `渠道 ${channel.code} ${channel.nameZh} / ${channel.namePt}`,
      `国家 ${channel.country}，方式 ${channel.mode}，币种 ${channel.currency}，单位 ${channel.unit}`,
      `分段：${tiers}`,
      `分类单价：${classes}`,
      `计费规则：${JSON.stringify(channel.rules || {})}`,
      `带电接收：${channel.battery || 'none'}`
    ].join('\n');
    chunks.push({ heading: `${channel.code} ${channel.nameZh}`, text });
  }
  const meta = `价目表版本 ${table.version}，生效日期 ${table.effectiveDate || ''}，${table.fxNote || ''}。共 ${(table.channels || []).length} 个渠道。`;
  chunks.unshift({ heading: '价目表说明', text: meta });
  return chunks;
}
