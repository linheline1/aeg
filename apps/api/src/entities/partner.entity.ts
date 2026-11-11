import { Entity, PrimaryColumn, Column } from 'typeorm';

/** 合作伙伴（海运承运商 / 生态合作伙伴）：管理端维护，品牌 logo 必传，官网合作伙伴页展示 */
@Entity('partner')
export class PartnerEntity {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id!: string;

  /** 分类：carrier=海运承运商；ecosystem=生态合作伙伴 */
  @Column({ type: 'varchar', length: 20 })
  category!: string;

  /** 展示名称（如「地中海航运 MSC」） */
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /** 相对仓库根的 logo 存储路径 apps/api/uploads/partners/xxx.svg */
  @Column({ type: 'varchar', length: 500 })
  logo_file_path!: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  logo_mime_type!: string;

  @Column({ type: 'integer', default: 0 })
  logo_size_bytes!: number;

  /** 官网链接（落地页点击 logo 跳转；空串表示未设置） */
  @Column({ type: 'varchar', length: 300, default: '' })
  website_url!: string;

  @Column({ type: 'timestamp' })
  created_at!: Date;
}
