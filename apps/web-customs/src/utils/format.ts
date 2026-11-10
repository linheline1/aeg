import i18n from '../i18n';

const locale = () => i18n.language?.startsWith('pt') ? 'pt-BR' : 'zh-CN';
const currency = (value: number, code: string) => new Intl.NumberFormat(locale(), { style: 'currency', currency: code }).format(value);
const formattedNumber = (value: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 3 }).format(value);

export const brl = (value?: number | null) => value == null || !Number.isFinite(Number(value)) ? '—' : currency(Number(value), 'BRL');
export const usd = (value?: number | null) => value == null || !Number.isFinite(Number(value)) ? '—' : currency(Number(value), 'USD');
export const rmb = (value?: number | null) => value == null || !Number.isFinite(Number(value)) ? '—' : currency(Number(value), 'CNY');
export const number = (value?: number | null) => value == null || !Number.isFinite(Number(value)) ? '—' : formattedNumber(Number(value));
export const percent = (value?: number | null) => value == null ? '—' : `${formattedNumber(Number(value))}%`;
export const dateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(locale(), { dateStyle: 'short', timeStyle: 'short' }).format(date);
};
export const bytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${formattedNumber(value / 1024)} KB`;
  return `${formattedNumber(value / (1024 * 1024))} MB`;
};

export const ORDER_STATUS: Record<string, string> = {
  uploaded: 'Enviado',
  pending_fee: 'Aguardando cálculo',
  computing: 'Em cálculo',
  done: 'Concluído',
  failed: 'Com falha',
  pending: 'Pendente',
  approved: 'Aprovado',
  changes_requested: 'Alterações solicitadas',
  customs_in_progress: 'Em desembaraço',
  cleared: 'Desembaraçado'
};
export const REVIEW_STATUS: Record<string, string> = {
  pending: 'Aguardando análise',
  approved: 'DI aprovada',
  changes_requested: 'Alterações solicitadas'
};
export const STAGE: Record<string, string> = {
  customs_br: 'Desembaraço no Brasil',
  duty_paid: 'Tributos pagos',
  cleared: 'Desembaraçado'
};
