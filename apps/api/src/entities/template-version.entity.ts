import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToMany, Index, BeforeInsert
} from 'typeorm';
import * as crypto from 'crypto';
import { TemplateFieldEntity } from './template-field.entity';

@Entity('template_version')
export class TemplateVersionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @BeforeInsert()
  genId() { if (!this.id) this.id = crypto.randomUUID(); }

  @Column({ type: 'varchar', length: 50, default: 'BR_FCL' })
  template_code!: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  version_no!: string;

  @Column({ type: 'varchar', length: 500 })
  file_path!: string;

  @Column({ type: 'varchar', length: 128 })
  file_hash!: string;

  @Column({ type: 'jsonb' })
  schema_json!: Record<string, any>;

  @Column({ type: 'jsonb' })
  meta_json!: {
    template_id: string; version: string; schema_hash: string;
    published_at: string; min_rows: number; max_rows: number;
  };

  @Column({ type: 'varchar', length: 20, default: 'inactive' })
  status!: 'active' | 'inactive';

  @Column({ type: 'uuid', nullable: true })
  created_by?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  activated_at?: Date | null;

  @OneToMany(() => TemplateFieldEntity, (f) => f.template_version)
  fields!: TemplateFieldEntity[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
