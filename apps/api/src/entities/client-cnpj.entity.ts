import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  Index, BeforeInsert
} from 'typeorm';
import * as crypto from 'crypto';

/** 客户开票 CNPJ（M9：一个客户可维护多个巴西公司税号） */
@Entity('client_cnpj')
export class ClientCnpjEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @BeforeInsert()
  genId() { if (!this.id) this.id = crypto.randomUUID(); }

  @Index()
  @Column({ type: 'uuid' })
  client_id!: string;

  /** 14 位税号（格式化 xx.xxx.xxx/xxxx-xx） */
  @Column({ type: 'varchar', length: 20 })
  cnpj!: string;

  /** 公司名称（发票抬头） */
  @Column({ type: 'varchar', length: 200 })
  company_name!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  ie?: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  nome_fantasia?: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  situacao_cadastral?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  endereco?: {
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    municipio?: string | null;
    uf?: string | null;
    cep?: string | null;
  } | null;

  @Column({ type: 'jsonb', nullable: true })
  registry_snapshot?: Record<string, any> | null;

  @Column({ type: 'timestamp', nullable: true })
  queried_at?: Date | null;

  @Column({ type: 'boolean', default: false })
  is_default!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
