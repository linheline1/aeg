const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const usdFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });
const rmbFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'CNY' });
const numberFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

export const brl = (value?: number | null) => value == null || !Number.isFinite(Number(value)) ? '—' : brlFormatter.format(Number(value));
export const usd = (value?: number | null) => value == null || !Number.isFinite(Number(value)) ? '—' : usdFormatter.format(Number(value));
export const rmb = (value?: number | null) => value == null || !Number.isFinite(Number(value)) ? '—' : rmbFormatter.format(Number(value));
export const number = (value?: number | null) => value == null || !Number.isFinite(Number(value)) ? '—' : numberFormatter.format(Number(value));
export const percent = (value?: number | null) => value == null ? '—' : `${numberFormatter.format(Number(value))}%`;
export const dateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};
export const bytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${numberFormatter.format(value / 1024)} KB`;
  return `${numberFormatter.format(value / (1024 * 1024))} MB`;
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
