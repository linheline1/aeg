import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  Index, BeforeInsert
} from 'typeorm';
import * as crypto from 'crypto';

@Entity('upload_draft')
export class UploadDraftEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @BeforeInsert()
  genId() { if (!this.id) this.id = crypto.randomUUID(); }

  @Index()
  @Column({ type: 'uuid' })
  client_id!: string;

  @Column({ type: 'varchar', length: 20, default: 'preview' })
  status!: 'preview' | 'confirmed' | 'cancelled';

  @Column({ type: 'varchar', length: 255 })
  file_name!: string;

  @Column({ type: 'varchar', length: 500 })
  file_path!: string;

  @Column({ type: 'varchar', length: 20 })
  template_version!: string;

  @Column({ type: 'jsonb' })
  rows!: any[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  warehouse_code?: string | null;

  @Column({ type: 'boolean', default: false })
  converted_by_ai!: boolean;

  @Column({ type: 'text', nullable: true })
  ai_notes?: string | null;

  @Column({ type: 'varchar', length: 3, default: 'RMB' })
  declared_currency!: 'RMB' | 'USD';

  @Column({ type: 'jsonb', nullable: true })
  screenshots?: any[] | null;

  @Column({ type: 'uuid', nullable: true })
  quote_id?: string | null;

  @Column({ type: 'timestamp' })
  expires_at!: Date;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
