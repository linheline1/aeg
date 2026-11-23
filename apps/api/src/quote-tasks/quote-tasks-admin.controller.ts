import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard, Roles, RolesGuard } from '../common/guards/auth.guard';
import { QuoteAiTasksService } from './quote-ai-tasks.service';

@Controller('admin/ai-config/tasks')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class QuoteTasksAdminController {
  constructor(private readonly tasks: QuoteAiTasksService) {}

  @Get()
  counts() { return this.tasks.counts(); }
}
