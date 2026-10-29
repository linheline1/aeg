import {
  Entity, PrimaryColumn, Column, CreateDateColumn, Index, BeforeInsert
} from 'typeorm';
import * as crypto from 'crypto';

/** 订单交付文件（M8：运营上传的放行截图 / 发票 PDF） */
@Entity('order_file')
export class OrderFileEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @BeforeInsert()
  genId() { if (!this.id) this.id = crypto.randomUUID(); }

  @Index()
  @Column({ type: 'uuid' })
  quote_id!: string;

  @Column({ type: 'varchar', length: 20 })
  kind!: 'clearance_shot' | 'invoice' | 'other';

  @Column({ type: 'varchar', length: 255 })
  file_name!: string;

  @Column({ type: 'varchar', length: 500 })
  file_path!: string;

  @Column({ type: 'varchar', length: 100 })
  mime_type!: string;

  @Column({ type: 'int' })
  size_bytes!: number;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'varchar', length: 64 })
  uploaded_by!: string;

  @CreateDateColumn()
  created_at!: Date;
}
