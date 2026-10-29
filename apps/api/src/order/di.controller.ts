import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Request } from 'express';
import { AuthGuard, Roles, RolesGuard } from '../common/guards/auth.guard';
import { DiService } from './di.service';

@Controller('ops/orders')
@UsePipes(new ValidationPipe({ whitelist: false }))
@UseGuards(AuthGuard, RolesGuard)
@Roles('operator', 'admin')
export class DiController {
  constructor(private readonly service: DiService) {}

  @Post(':id/di/analyze')
  analyze(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.service.analyze(id, body, { username: req.user?.username || 'system', role: req.user?.role || 'system' });
  }

  @Patch(':id/di/review')
  review(@Param('id') id: string, @Body() body: any, @Req() req: Request & { user?: any }) {
    return this.service.review(id, body, { username: req.user?.username || 'system', role: req.user?.role || 'system' });
  }

  @Get(':id/di/versions')
  listVersions(@Param('id') id: string) {
    return this.service.listVersions(id);
  }

  @Get(':id/di/versions/:version')
  getVersion(@Param('id') id: string, @Param('version') version: string) {
    return this.service.getVersion(id, version);
  }

  @Post(':id/di/ddp')
  generateDdp(@Param('id') id: string, @Req() req: Request & { user?: any }) {
    return this.service.generateDdp(id, { username: req.user?.username || 'system', role: req.user?.role || 'system' });
  }
}
