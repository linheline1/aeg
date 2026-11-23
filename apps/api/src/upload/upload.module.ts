import { Module } from '@nestjs/common';
import { ClientUploadController } from './client-upload.controller';
import { OpsUploadController } from './ops-upload.controller';
import { ClientImageController, OpsImageController } from './image.controller';
import { QuoteService } from './quote.service';
import { AiConvertService } from '../convert/ai-convert.service';
import { AiNcmService } from '../order/ai-ncm.service';
import { AuthModule } from '../auth/auth.module';
import { MulterModule } from '@nestjs/platform-express';
import { repoRoot } from '../common/mock-db';
import path from 'path';
import { QuoteAiTasksService } from '../quote-tasks/quote-ai-tasks.service';
import { QuoteTaskStore } from '../quote-tasks/quote-task.store';
import { QuoteTasksAdminController } from '../quote-tasks/quote-tasks-admin.controller';

@Module({
  imports: [
    AuthModule,
    MulterModule.register({
      dest: path.join(repoRoot(), 'apps/api/uploads/tmp'),
      preservePath: true
    })
  ],
  controllers: [ClientUploadController, OpsUploadController, ClientImageController, OpsImageController, QuoteTasksAdminController],
  providers: [QuoteService, AiConvertService, AiNcmService, QuoteTaskStore, QuoteAiTasksService],
  exports: [QuoteService, QuoteAiTasksService]
})
export class UploadModule {}
