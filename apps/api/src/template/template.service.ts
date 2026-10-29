import { Injectable, Inject, NotFoundException } from '@nestjs/common';

@Injectable()
export class TemplateService {
  constructor(@Inject('TemplateRepo') private readonly repo: any) {}

  async getActive() {
    return this.repo.findOne({ where: { status: 'active' } });
  }

  async getByVersion(version: string) {
    const v = await this.repo.findOne({ where: { version_no: version } });
    if (!v) throw new NotFoundException(`模板版本 ${version} 不存在`);
    return v;
  }

  async list() {
    return this.repo.find();
  }
}
