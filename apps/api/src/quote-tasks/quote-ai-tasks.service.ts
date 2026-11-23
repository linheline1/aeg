import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { QuotesRepo, ImageRepo } from '../common/mock-db';
import { AiNcmService } from '../order/ai-ncm.service';
import { calculateDi, DiParameters } from '../order/di-calculation';
import { QuoteService } from '../upload/quote.service';
import { QuoteTaskStore } from './quote-task.store';
import { QuoteTask, TaskError, TaskKind, TaskRow } from './quote-task.types';

const batchSize = 4;
const concurrency = 3;
const leaseMs = 180_000;
const active = (task: QuoteTask) => task.status === 'queued' || task.status === 'running';
const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const taskKey = (kind: TaskKind, target: string) => kind + ':' + target;
const stale: TaskError = { code: 'stale', message: 'The quote or draft changed. Start a new analysis.' };
const invalid: TaskError = { code: 'invalid_result', message: 'No valid NCM result for this product row.' };

function classifyFailure(error: unknown): TaskError {
  const message = error instanceof Error ? error.message : '';
  if (/\b402\b/.test(message)) return { code: 'billing', message: 'The AI provider rejected billing (HTTP 402).' };
  if (/timeout|timed out|aborted|tempo limite/i.test(message)) return { code: 'timeout', message: 'The AI provider timed out.' };
  return { code: 'provider', message: 'The AI provider could not complete this batch.' };
}

@Injectable()
export class QuoteAiTasksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QuoteAiTasksService.name);
  private readonly inFlight = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;

  constructor(
    private readonly store: QuoteTaskStore,
    private readonly quoteService: QuoteService,
    private readonly ai: AiNcmService,
    @Inject('QuotesRepo') private readonly quotes: QuotesRepo,
    @Inject('ImageRepo') private readonly images: ImageRepo
  ) {}

  onModuleInit() { this.timer = setInterval(() => void this.tick(), 1000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private summary(task: QuoteTask, includeResult: boolean) {
    const rows = Object.entries(task.rows);
    const completed = rows.filter(([, row]) => row.suggestion).length;
    const failures = rows.flatMap(([row, item]) => item.error ? [{ row_no: Number(row), ...item.error }] : []);
    return {
      id: task.id, status: task.status, total: rows.length, completed, failed: failures.length,
      error: task.error, ...(includeResult ? { failures, result: task.result } : {})
    };
  }

  private lineItems(task: QuoteTask): any[] {
    return task.kind === 'di' ? task.input.rows : task.input.rows
      .filter(row => task.rows[row.row_no])
      .map(row => ({ ...row.data, row_no: row.row_no }));
  }

  private checkpointRows(rows: any[], images: any[]): Record<string, TaskRow> {
    return Object.fromEntries(rows.map(row => [row.row_no, {
      fingerprint: fingerprint([row.hs_code, row.sku, row.product_cn, row.product_en, row.material, row.description,
        images.filter(image => Number(image.row_no) === Number(row.row_no)).map(image => image.file_path)])
    }]));
  }

  private async enqueue(next: QuoteTask, retain: (old: QuoteTask) => boolean, reuseComplete = false, keepExisting = false) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const old = await this.store.get(next.key);
      if (old && (active(old) || keepExisting)) {
        if (!keepExisting && old.fingerprint !== next.fingerprint) {
          throw new ConflictException('Another analysis is already running for different input.');
        }
        return this.summary(old, true);
      }
      if (old?.status === 'complete' && reuseComplete && old.fingerprint === next.fingerprint) return this.summary(old, true);
      const reusable = old && retain(old) ? old.rows : {};
      for (const [key, row] of Object.entries(next.rows)) {
        const previous = reusable[key];
        row.suggestion = previous?.fingerprint === row.fingerprint ? previous.suggestion : undefined;
      }
      if (await this.store.save(next, old?.revision ?? null)) return this.summary(next, true);
    }
    throw new ConflictException('The analysis changed. Please retry.');
  }

  async startNcm(draftId: string, clientId: string, rows: any[], currency?: string) {
    const input = await this.quoteService.prepareUploadTask(draftId, clientId, rows);
    const declaredCurrency = currency === 'USD' || currency === 'RMB' ? currency : input.declaredCurrency;
    const lineItems = input.needsNcm.map(row => ({ ...row.data, row_no: row.row_no }));
    return this.enqueue({
      key: taskKey('ncm', draftId), id: randomUUID(), kind: 'ncm', target: draftId, clientId,
      status: 'queued', fingerprint: fingerprint([input.rows, input.images, declaredCurrency]),
      input: { rows: input.rows, images: input.images, currency: declaredCurrency },
      rows: this.checkpointRows(lineItems, input.images), revision: 0, updatedAt: Date.now()
    }, old => old.status !== 'stale', true);
  }

  async getNcm(draftId: string, clientId: string) {
    const draft = await this.quoteService.getUploadDraft(draftId, clientId);
    if (draft.status !== 'preview' || new Date(draft.expires_at).getTime() <= Date.now()) return null;
    const task = await this.store.get(taskKey('ncm', draftId));
    return task && task.clientId === clientId
      ? { ...this.summary(task, true), inputRows: task.input.rows, currency: task.input.currency ?? draft.declared_currency,
        expiresAt: draft.expires_at, filename: draft.file_name }
      : null;
  }

  async startDi(id: string, parameters: DiParameters | undefined, actor: { username: string; role: string }, automatic = false) {
    const order = await this.quotes.findVersioned(id);
    if (!order) throw new NotFoundException('Order not found');
    if (!order.line_items?.length) throw new BadRequestException('No products to analyze');
    const existing = await this.store.get(taskKey('di', id));
    if (automatic && existing) return this.summary(existing, true);
    if (automatic && (order.status !== 'uploaded' || order.di_analysis?.items?.length)) return null;
    const autoInput = automatic ? await this.quoteService.autoDiInput(order) : undefined;
    const inputParameters = autoInput?.parameters ?? parameters;
    if (!inputParameters || !(Number(inputParameters.rmb_brl) > 0)
      || !Number.isFinite(Number(inputParameters.rmb_brl))
      || !(Number(inputParameters.icms_rate) >= 0 && Number(inputParameters.icms_rate) < 1)
      || !/^[A-Z]{2}$/i.test(String(inputParameters.uf || '').trim())
      || [inputParameters.insurance_brl, inputParameters.freight_brl].some(value => value != null && (!Number.isFinite(Number(value)) || Number(value) < 0))) {
      throw new BadRequestException('Invalid DI parameters');
    }
    const images = await this.images.findByQuote(id);
    return this.enqueue({
      key: taskKey('di', id), id: randomUUID(), kind: 'di', target: id, clientId: order.client_id,
      status: 'queued', fingerprint: fingerprint([order.revision, inputParameters, automatic]),
      orderVersion: order.revision,
      input: { rows: order.line_items, images, parameters: inputParameters, rates: autoInput?.rates, automatic, actor },
      rows: this.checkpointRows(order.line_items, images), revision: 0, updatedAt: Date.now()
    }, old => ['failed', 'partial'].includes(old.status) && old.orderVersion === order.revision, false, automatic);
  }

  async getDi(id: string, includeResult = true) {
    const task = await this.store.get(taskKey('di', id));
    if (!task) return null;
    if (!includeResult) return this.summary(task, false);
    const order = await this.quotes.findVersioned(id);
    if (!order) return null;
    if (active(task) || ['failed', 'partial'].includes(task.status)) {
      if (order.revision !== task.orderVersion && order.di_analysis?.task_id !== task.id) {
        return this.summary({ ...task, status: 'stale', error: stale }, true);
      }
    }
    if (task.status === 'complete' && order.di_analysis?.task_id !== task.id) return null;
    return this.summary(task, true);
  }

  async enqueueAutomatic(id: string, actor = { username: 'system', role: 'system' }) {
    try {
      return !!(await this.startDi(id, undefined, actor, true));
    } catch {
      this.logger.error('Could not enqueue automatic DI for quote ' + id);
      return false;
    }
  }

  async retryDi(id: string, actor: { username: string; role: string }) {
    const old = await this.store.get(taskKey('di', id));
    if (!old || !['failed', 'partial'].includes(old.status)) throw new ConflictException('No failed analysis to retry.');
    const order = await this.quotes.findVersioned(id);
    if (order?.revision !== old.orderVersion) throw new ConflictException(stale.message);
    const rows = Object.fromEntries(Object.entries(old.rows).map(([key, row]) => [
      key, { fingerprint: row.fingerprint, suggestion: row.suggestion }
    ]));
    const next: QuoteTask = { ...old, id: randomUUID(), status: 'queued', rows, error: undefined, result: undefined,
      input: { ...old.input, actor }, leaseUntil: undefined };
    if (!(await this.store.save(next, old.revision))) throw new ConflictException('The analysis changed. Please retry.');
    return this.summary(next, true);
  }

  counts() { return this.store.counts(); }

  async tick() {
    if (this.polling) return;
    this.polling = true;
    try {
      const capacity = concurrency - this.inFlight.size;
      if (capacity <= 0) return;
      const due = await this.store.due(Date.now(), concurrency * 2);
      for (const task of due.filter(job => !this.inFlight.has(job.key)).slice(0, capacity)) {
        this.inFlight.add(task.key);
        void this.step(task).catch(() => this.logger.error('Failed to persist quote analysis progress'))
          .finally(() => this.inFlight.delete(task.key));
      }
    } catch {
      this.logger.error('Failed to retrieve pending quote analysis tasks');
    } finally {
      this.polling = false;
    }
  }

  async step(task: QuoteTask) {
    if (!active(task)) return;
    const claimed = { ...task, status: 'running' as const, leaseUntil: Date.now() + leaseMs };
    if (!(await this.store.save(claimed, task.revision))) return;
    const revision = task.revision + 1;
    const next: QuoteTask = { ...claimed, leaseUntil: undefined };
    try {
      const order = task.kind === 'di' ? await this.quotes.findVersioned(task.target) : null;
      if (order?.di_analysis?.task_id === task.id) {
        next.status = 'complete';
        next.result = order.di_analysis;
      } else if (task.kind === 'di' && (!order || order.revision !== task.orderVersion)) {
        next.status = 'stale';
        next.error = stale;
      } else {
        if (task.kind === 'ncm') {
          const draft = await this.quoteService.getUploadDraft(task.target, task.clientId);
          if (draft.status !== 'preview' || new Date(draft.expires_at).getTime() <= Date.now()) {
            next.status = 'stale';
            next.error = stale;
            await this.store.save(next, revision);
            return;
          }
        }
        const pending = this.lineItems(task).filter(row => !task.rows[row.row_no].suggestion && !task.rows[row.row_no].error);
        if (pending.length) {
          await this.runBatch(next, pending);
          next.status = 'queued';
        } else {
          await this.finish(next, order);
        }
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        next.status = 'stale';
        next.error = stale;
      } else {
        next.status = 'failed';
        next.error = { code: 'calculation', message: error instanceof BadRequestException ? error.message : 'Analysis could not be saved.' };
      }
    }
    await this.store.save(next, revision);
  }

  private async runBatch(task: QuoteTask, pending: any[]) {
    const batch = pending.slice(0, batchSize);
    const images = task.input.images.filter(image => batch.some(row => Number(row.row_no) === Number(image.row_no)));
    let output: any[];
    try {
      output = await this.ai.suggest({ line_items: batch, images, retryTimedOutBatch: false });
    } catch (reason) {
      const error = classifyFailure(reason);
      for (const row of error.code === 'billing' ? pending : batch) task.rows[row.row_no].error = error;
      return;
    }
    for (const row of batch) {
      const reply = output.find(item => Number(item.row_no) === Number(row.row_no));
      const ncm = String(reply?.ncm || '');
      const prefix = String(row.hs_code || '').trim().slice(0, 6);
      const validCode = /^\d{8}$/.test(ncm) && (task.kind === 'di' || !prefix || ncm.startsWith(prefix));
      const validDi = task.kind !== 'di' || (
        (task.input.automatic || reply?.sources?.length)
        && ['ii_rate', 'ipi_rate', 'pis_rate', 'cofins_rate'].every(key => reply?.[key] != null && Number(reply[key]) >= 0 && Number(reply[key]) <= 0.999999)
      );
      if (validCode && validDi) task.rows[row.row_no].suggestion = reply;
      else task.rows[row.row_no].error = invalid;
    }
  }

  private async finish(task: QuoteTask, order: any) {
    const checkpoints = Object.entries(task.rows);
    const suggestions = checkpoints.flatMap(([, row]) => row.suggestion ? [row.suggestion] : []);
    const errors = checkpoints.filter(([, row]) => row.error);
    if (task.kind === 'ncm') {
      const prepared = await this.quoteService.prepareUploadTask(task.target, task.clientId, task.input.rows);
      task.result = this.quoteService.finishUploadTask(prepared, suggestions,
        new Map(errors.map(([row, item]) => [Number(row), item.error!.message])));
    }
    if (errors.length) {
      task.status = suggestions.length ? 'partial' : 'failed';
      task.error = errors.find(([, row]) => row.error?.code === 'billing')?.[1].error ?? errors[0][1].error;
    } else if (task.kind === 'di') {
      const analysis = {
        ...calculateDi(order, suggestions, task.input.parameters!),
        task_id: task.id, auto: !!task.input.automatic, progress: 100, stage: 'completed'
      };
      if (!(await this.quoteService.publishTaskDi(order, analysis, task.input.rates, task.input.actor!))) {
        task.status = 'stale';
        task.error = stale;
        return;
      }
      task.status = 'complete';
      task.result = analysis;
    } else {
      task.status = 'complete';
    }
  }
}
