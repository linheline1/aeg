import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject,
  NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { AuthGuard, Roles, RolesGuard } from '../common/guards/auth.guard';
import { QuotesRepo, repoRoot, type QuoteOrderRow } from '../common/mock-db';
import { decodeLicenseFileName } from '../common/license-upload';
import { DOCUMENT_TYPES, type DocumentVersion, type OrderDocument } from './order-document';

type Actor = { role: string; username: string; client_id?: string };
type DocumentRequest = Request & { user: Actor };
const fileDirectory = 'apps/api/uploads/orderfiles';
const maxFileSize = 10 * 1024 * 1024;
const maxDocuments = 50;

function publicDocument(document: OrderDocument) {
  return { ...document, versions: document.versions.map(({ file_path, ...version }) => version) };
}

function text(value: unknown, maxLength: number): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) throw new BadRequestException('Invalid document text');
  return value.trim() || null;
}

function documentFilename(file: Express.Multer.File) {
  const name = decodeLicenseFileName(file.originalname).split(/[\\/]/).pop()?.replace(/[\x00-\x1f\x7f]/g, '').trim() || '';
  const extension = path.extname(name).toLowerCase();
  const bytes = file.buffer;
  const valid = bytes?.length && (
    (extension === '.pdf' && bytes.subarray(0, 5).toString() === '%PDF-')
    || (['.jpg', '.jpeg'].includes(extension) && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    || (extension === '.png' && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    || (extension === '.xlsx' && bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])))
  );
  if (!valid || name.length > 240) throw new BadRequestException('Invalid file. Use PDF, XLSX, JPEG or PNG.');
  return name;
}

@Controller(':portal/orders/:id/documents')
@UseGuards(AuthGuard, RolesGuard)
@Roles('client', 'operator', 'admin', 'customs')
export class OrderDocumentsController {
  constructor(@Inject('QuotesRepo') private readonly quotes: QuotesRepo) {}

  private async order(portal: string, id: string, actor: Actor) {
    const expectedPortal = actor.role === 'operator' || actor.role === 'admin' ? 'ops' : actor.role;
    if (portal !== expectedPortal) throw new ForbiddenException();
    const order = await this.quotes.findVersioned(id);
    if (!order || (portal === 'client' && (!actor.client_id || order.client_id !== actor.client_id))) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  private findDocument(order: QuoteOrderRow, documentId: string) {
    const document = order.document_requests?.find(item => item.id === documentId);
    if (!document) throw new NotFoundException('Document request not found');
    return document;
  }

  private async save(order: QuoteOrderRow & { revision: string }, document: OrderDocument, actor: Actor, action: string) {
    const documents = order.document_requests ?? [];
    const next = document.revision === 1 ? [...documents, document] :
      documents.map(item => item.id === document.id ? document : item);
    const latest = document.versions.at(-1);
    const result = await this.quotes.updateIfUnchanged(order.id, order.revision, { document_requests: next }, {
      actor_username: actor.username, actor_role: actor.role, action, target_type: 'quote', target_id: order.id,
      detail: {
        quote_no: order.quote_no, document_id: document.id, type: document.type, status: document.status,
        version: document.versions.length, file: latest?.file_name, reason: latest?.review?.reason
      }
    });
    if (!result) throw new ConflictException('Order changed. Reload the documents and retry.');
    return publicDocument(document);
  }

  @Get()
  async list(@Param('portal') portal: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: DocumentRequest) {
    const order = await this.order(portal, id, req.user);
    return (order.document_requests ?? []).map(publicDocument);
  }

  @Post()
  @Roles('operator', 'admin', 'customs')
  async requestDocument(@Param('portal') portal: string, @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { type?: string; title?: string; instructions?: string }, @Req() req: DocumentRequest) {
    const order = await this.order(portal, id, req.user);
    const type = DOCUMENT_TYPES.find(value => value === body?.type);
    const title = text(body?.title, 120);
    const instructions = text(body?.instructions, 500);
    if (!type || (type === 'other' && !title)) throw new BadRequestException('Select a document type and name other documents');
    if ((order.document_requests?.length ?? 0) >= maxDocuments) throw new BadRequestException('Document request limit reached');
    return this.save(order, {
      id: randomUUID(), type, title, instructions, requested_at: new Date().toISOString(),
      status: 'missing', revision: 1, versions: []
    }, req.user, 'order.document.request');
  }

  @Post(':documentId/versions')
  @Roles('client')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: maxFileSize, files: 1, fields: 1 } }))
  async submit(@Param('portal') portal: string, @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string, @UploadedFile() file: Express.Multer.File | undefined,
    @Body('revision') revision: string, @Req() req: DocumentRequest) {
    const order = await this.order(portal, id, req.user);
    const document = this.findDocument(order, documentId);
    if (String(document.revision) !== revision || !['missing', 'rejected'].includes(document.status)) {
      throw new ConflictException('This request no longer accepts a submission');
    }
    if (!file || file.size > maxFileSize) throw new BadRequestException('Select a file up to 10 MB');
    const name = documentFilename(file);
    const versionId = randomUUID();
    const version: DocumentVersion = {
      id: versionId, file_name: name, file_path: `${fileDirectory}/document-${versionId}`,
      size_bytes: file.size, submitted_at: new Date().toISOString()
    };
    const absolute = path.join(repoRoot(), version.file_path);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, file.buffer, { flag: 'wx', mode: 0o600 });
    try {
      return await this.save(order, {
        ...document, status: 'submitted', revision: document.revision + 1, versions: [...document.versions, version]
      }, req.user, 'order.document.submit');
    } catch (error) {
      // A failed compare-and-set confirms no version references this file.
      if (error instanceof ConflictException) await fs.unlink(absolute).catch(() => {});
      throw error;
    }
  }

  @Patch(':documentId/review')
  @Roles('operator', 'admin', 'customs')
  async review(@Param('portal') portal: string, @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() body: { revision?: number; version_id?: string; status?: string; reason?: string }, @Req() req: DocumentRequest) {
    const order = await this.order(portal, id, req.user);
    const document = this.findDocument(order, documentId);
    const version = document.versions.at(-1);
    if (!version || document.status !== 'submitted' || body?.revision !== document.revision || body.version_id !== version.id) {
      throw new ConflictException('This version is no longer awaiting review');
    }
    const status = body.status;
    const reason = text(body.reason, 500);
    if ((status !== 'approved' && status !== 'rejected') || (status === 'rejected' && !reason)) {
      throw new BadRequestException('A rejection requires a reason');
    }
    return this.save(order, {
      ...document, status, revision: document.revision + 1,
      versions: [...document.versions.slice(0, -1), { ...version, review: { status, reason, at: new Date().toISOString() } }]
    }, req.user, 'order.document.review');
  }

  @Get(':documentId/versions/:versionId/file')
  async download(@Param('portal') portal: string, @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string, @Param('versionId', ParseUUIDPipe) versionId: string,
    @Req() req: DocumentRequest, @Res() res: Response) {
    const order = await this.order(portal, id, req.user);
    const version = this.findDocument(order, documentId).versions.find(item => item.id === versionId);
    const expected = `${fileDirectory}/document-${versionId}`;
    if (!version || version.file_path !== expected) throw new NotFoundException('Document file not found');
    const absolute = path.join(repoRoot(), expected);
    try { await fs.access(absolute); } catch { throw new NotFoundException('Document file not found'); }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.download(absolute, version.file_name, { headers: { 'Content-Type': 'application/octet-stream' } });
  }
}
