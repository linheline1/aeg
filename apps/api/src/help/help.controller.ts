import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, Inject,
  NotFoundException, Param, Patch, Post, Query, Req, UseGuards
} from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../common/guards/auth.guard';
import { AuditRepo, HelpArticleRow, HelpArticlesRepo } from '../common/mock-db';
import { HELP_CATEGORIES } from '../common/help-seed';

type HelpApp = 'client' | 'ops';
type ArticleInput = {
  app?: HelpApp;
  category?: string;
  slug?: string;
  title?: string;
  summary?: string;
  content?: string;
  published?: boolean;
  featured?: boolean;
  sort_order?: number;
};

function appOf(value: unknown): HelpApp {
  if (value !== 'client' && value !== 'ops') throw new BadRequestException('所属端必须是 client 或 ops');
  return value;
}

function categoryOf(app: HelpApp, value: unknown): string {
  const category = String(value || '').trim();
  const allowed: readonly string[] = HELP_CATEGORIES[app];
  if (!allowed.includes(category)) throw new BadRequestException('文章分类无效');
  return category;
}

function slugOf(value: unknown): string {
  const slug = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
    throw new BadRequestException('URL 标识需为小写字母、数字或连字符，且不能以连字符开头或结尾');
  }
  return slug;
}

function requiredText(value: unknown, label: string, max: number): string {
  const text = String(value || '').trim();
  if (!text) throw new BadRequestException(`${label}不能为空`);
  if (text.length > max) throw new BadRequestException(`${label}最多 ${max} 字符`);
  return text;
}

function sortOf(value: unknown): number {
  const sort = value === undefined ? 0 : Number(value);
  if (!Number.isInteger(sort) || sort < 0 || sort > 100000) throw new BadRequestException('排序值需为 0-100000 的整数');
  return sort;
}

@Controller('admin/help/articles')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class AdminHelpController {
  constructor(
    @Inject('HelpArticlesRepo') private readonly repo: HelpArticlesRepo,
    @Inject('AuditRepo') private readonly auditRepo: AuditRepo
  ) {}

  @Get()
  list(@Query('app') app?: string) {
    return this.repo.findAll(app ? appOf(app) : undefined);
  }

  @Post()
  async create(@Body() body: ArticleInput, @Req() req: any) {
    const app = appOf(body.app);
    const slug = slugOf(body.slug);
    if (await this.repo.findBySlug(app, slug)) throw new ConflictException('该端已存在相同 URL 标识的文章');
    const saved = await this.repo.insert({
      app,
      category: categoryOf(app, body.category),
      slug,
      title: requiredText(body.title, '文章标题', 200),
      summary: requiredText(body.summary, '文章摘要', 500),
      content: requiredText(body.content, '文章正文', 100000),
      published: body.published !== false,
      featured: body.featured === true,
      sort_order: sortOf(body.sort_order)
    });
    await this.auditRepo.entry({
      actor_username: req.user?.username || 'admin', actor_role: 'admin', action: 'help.article.create',
      target_type: 'help_article', target_id: saved.id,
      detail: { app, slug, title: saved.title, published: saved.published }
    });
    return saved;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: ArticleInput, @Req() req: any) {
    const current = await this.repo.findById(id);
    if (!current) throw new NotFoundException('帮助文章不存在');
    const patch: Partial<HelpArticleRow> = {};
    if (body.category !== undefined) patch.category = categoryOf(current.app, body.category);
    if (body.slug !== undefined) {
      const slug = slugOf(body.slug);
      const duplicate = await this.repo.findBySlug(current.app, slug);
      if (duplicate && duplicate.id !== id) throw new ConflictException('该端已存在相同 URL 标识的文章');
      patch.slug = slug;
    }
    if (body.title !== undefined) patch.title = requiredText(body.title, '文章标题', 200);
    if (body.summary !== undefined) patch.summary = requiredText(body.summary, '文章摘要', 500);
    if (body.content !== undefined) patch.content = requiredText(body.content, '文章正文', 100000);
    if (body.published !== undefined) patch.published = body.published === true;
    if (body.featured !== undefined) patch.featured = body.featured === true;
    if (body.sort_order !== undefined) patch.sort_order = sortOf(body.sort_order);
    if (Object.keys(patch).length === 0) throw new BadRequestException('没有需要修改的内容');
    const saved = await this.repo.update(id, patch);
    await this.auditRepo.entry({
      actor_username: req.user?.username || 'admin', actor_role: 'admin', action: 'help.article.update',
      target_type: 'help_article', target_id: id,
      detail: { app: current.app, slug: current.slug, before: { published: current.published, sort_order: current.sort_order }, after: patch }
    });
    return saved;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    const current = await this.repo.findById(id);
    if (!current) throw new NotFoundException('帮助文章不存在');
    await this.repo.deleteById(id);
    await this.auditRepo.entry({
      actor_username: req.user?.username || 'admin', actor_role: 'admin', action: 'help.article.delete',
      target_type: 'help_article', target_id: id,
      detail: { app: current.app, slug: current.slug, title: current.title }
    });
    return { ok: true };
  }
}

@Controller('client/help')
@UseGuards(AuthGuard, RolesGuard)
@Roles('client')
export class ClientHelpController {
  constructor(@Inject('HelpArticlesRepo') private readonly repo: HelpArticlesRepo) {}

  @Get('articles')
  list() { return this.repo.findPublished('client'); }
}

@Controller('ops/help')
@UseGuards(AuthGuard, RolesGuard)
@Roles('operator', 'sales')
export class OpsHelpController {
  constructor(@Inject('HelpArticlesRepo') private readonly repo: HelpArticlesRepo) {}

  @Get('articles')
  list() { return this.repo.findPublished('ops'); }
}
