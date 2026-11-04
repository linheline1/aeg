import {
  BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch,
  Post, Query, Req, Res, UseGuards
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { AuthGuard, Roles, RolesGuard } from '../common/guards/auth.guard';
import { ImageRepo, QuotesRepo, repoRoot } from '../common/mock-db';
import { CustomsService } from './customs.service';

@Controller('customs')
@UseGuards(AuthGuard, RolesGuard)
@Roles('customs')
export class CustomsController {
  constructor(
    private readonly service: CustomsService,
    @Inject('ImageRepo') private readonly imageRepo: ImageRepo,
    @Inject('QuotesRepo') private readonly quotesRepo: QuotesRepo
  ) {}

  private actor(req: Request & { user?: any }) {
    return { username: req.user?.username || 'customs', role: req.user?.role || 'customs' };
  }

  @Get('home')
  home() {
    return this.service.home();
  }

  @Get('orders')
  list(@Query() query: { status?: string; q?: string; page?: string; pageSize?: string }) {
    return this.service.list(query);
  }

  @Get('orders/:id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Post('orders/:id/translate-products')
  translateProducts(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.service.translateProducts(id, this.actor(req));
  }

  @Post('orders/:id/di/analyze')
  analyze(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.service.analyze(id, body, this.actor(req));
  }

  @Patch('orders/:id/di/review')
  review(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.service.review(id, body, this.actor(req));
  }

  @Patch('orders/:id/review-status')
  reviewStatus(@Param('id') id: string, @Body() body: { status?: string; note?: string }, @Req() req: Request & { user?: any }) {
    if (body.status !== 'changes_requested') throw new BadRequestException('Status de revisão inválido');
    return this.service.requestChanges(id, body.note || '', this.actor(req));
  }

  @Get('orders/:id/di/versions')
  versions(@Param('id') id: string) {
    return this.service.listVersions(id);
  }

  @Post('orders/:id/progress')
  progress(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.service.addProgress(id, body, this.actor(req));
  }

  @Get('images/:id/file')
  async image(@Param('id') id: string, @Res() res: Response) {
    const image = await this.imageRepo.findById(id);
    if (!image?.quote_id) throw new NotFoundException('Imagem não encontrada');
    const order = await this.quotesRepo.findById(image.quote_id);
    if (!order) throw new NotFoundException('Imagem não encontrada');
    const absolute = path.join(repoRoot(), image.file_path);
    if (!fs.existsSync(absolute)) throw new NotFoundException('Arquivo da imagem não encontrado');
    res.setHeader('Content-Type', image.mime_type);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.sendFile(absolute);
  }
}
