import {
  Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, Index, BeforeInsert
} from 'typeorm';
import * as crypto from 'crypto';
import { TemplateVersionEntity } from './template-version.entity';

@Entity('template_field')
export class TemplateFieldEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @BeforeInsert()
  genId() { if (!this.id) this.id = crypto.randomUUID(); }

  @Index()
  @Column({ type: 'uuid' })
  template_version_id!: string;

  @ManyToOne(() => TemplateVersionEntity, (v) => v.fields, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_version_id' })
  template_version!: TemplateVersionEntity;

  @Column({ type: 'varchar', length: 5 })
  col_letter!: string;

  @Column({ type: 'varchar', length: 50 })
  header_cn!: string;

  @Column({ type: 'varchar', length: 50 })
  field_key!: string;

  @Column({ type: 'varchar', length: 20 })
  data_type!: string;

  @Column({ type: 'boolean', default: false })
  required!: boolean;

  @Column({ type: 'boolean', default: true })
  editable!: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  formula?: string;

  @Column({ type: 'jsonb', nullable: true })
  validation_json?: Record<string, any>;

  @Column({ type: 'boolean', default: true })
  visible_client!: boolean;

  @Column({ type: 'boolean', default: true })
  visible_operator!: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order!: number;
}
