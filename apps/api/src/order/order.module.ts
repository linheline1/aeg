import { Module } from '@nestjs/common';
import { ClientOrderController } from './client-order.controller';
import { ClientNotificationsController } from './client-notifications.controller';
import { OpsOrderController } from './ops-order.controller';
import { OpsProductController } from './ops-product.controller';
import { DealsController } from './deals.controller';
import { OpsOrderFilesController, ClientOrderFilesController } from './order-files.controller';
import { ClientCnpjController } from './cnpj.controller';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';
import { DiController } from './di.controller';
import { DiService } from './di.service';
import { AiNcmService } from './ai-ncm.service';
import { AisStreamService } from './ais-stream.service';
import { OrderDocumentsController } from './order-documents.controller';

@Module({
  imports: [AuthModule, UploadModule],
  controllers: [ClientOrderController, ClientNotificationsController, OpsOrderController, OpsProductController, DealsController, OpsOrderFilesController, ClientOrderFilesController, ClientCnpjController, DiController, OrderDocumentsController],
  providers: [DiService, AiNcmService, AisStreamService],
  exports: [DiService, AiNcmService]
})
export class OrderModule {}
