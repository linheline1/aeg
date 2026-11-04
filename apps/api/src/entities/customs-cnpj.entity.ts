import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  Index, BeforeInsert
} from 'typeorm';
import * as crypto from 'crypto';

@Entity('customs_cnpj')
export class CustomsCnpjEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @BeforeInsert()
  genId() { if (!this.id) this.id = crypto.randomUUID(); }

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  cnpj!: string;

  @Column({ type: 'varchar', length: 200 })
  company_name!: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: 'active' | 'disabled';

  @Column({ type: 'double precision', default: 0 })
  quota_limit_usd!: number;

  @Column({ type: 'double precision', default: 0 })
  quota_used_usd!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cert_a1_file_path?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cert_a1_file_name?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  cert_a1_mime_type?: string | null;

  @Column({ type: 'int', nullable: true })
  cert_a1_size_bytes?: number | null;

  @Column({ type: 'timestamp', nullable: true })
  cert_a1_uploaded_at?: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  ecpf_file_path?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ecpf_file_name?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ecpf_mime_type?: string | null;

  @Column({ type: 'int', nullable: true })
  ecpf_size_bytes?: number | null;

  @Column({ type: 'timestamp', nullable: true })
  ecpf_uploaded_at?: Date | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
