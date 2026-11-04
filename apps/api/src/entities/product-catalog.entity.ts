import {
  Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn,
  Index, BeforeInsert
} from 'typeorm';
import * as crypto from 'crypto';

@Entity('product_catalog')
export class ProductCatalogEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @BeforeInsert()
  genId() { if (!this.id) this.id = crypto.randomUUID(); }

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 160 })
  sku_key!: string;

  @Column({ type: 'varchar', length: 160 })
  sku!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  product_cn?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  product_en?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  material?: string | null;

  @Column({ type: 'double precision', nullable: true })
  base_unit_price_rmb?: number | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  ncm?: string | null;

  @Column({ type: 'double precision', nullable: true })
  ncm_confidence?: number | null;

  @Column({ type: 'text', nullable: true })
  ncm_rationale?: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  ncm_sources!: string[];

  @Column({ type: 'jsonb', nullable: true })
  tax_rates?: {
    ii_rate?: number | null;
    ipi_rate?: number | null;
    pis_rate?: number | null;
    cofins_rate?: number | null;
  } | null;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  image_ids!: string[];

  @Column({ type: 'uuid', nullable: true })
  last_quote_id?: string | null;

  @Column({ type: 'uuid', nullable: true })
  last_client_id?: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  ncm_reviewed_by?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  ncm_reviewed_at?: Date | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
