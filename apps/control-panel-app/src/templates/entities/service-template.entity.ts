import {
    Entity,
    Column,
    PrimaryColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('service_templates')
export class ServiceTemplateEntity {
    @PrimaryColumn({ type: 'varchar', length: 255 })
    slug!: string;

    @Column({ type: 'text' })
    name!: string;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    category!: string | null;

    @Column('text', { array: true, nullable: true })
    tags!: string[] | null;

    @Column({ type: 'text', nullable: true })
    documentation!: string | null;

    @Column({ type: 'text', nullable: true })
    logo!: string | null;

    @Column('text')
    compose!: string;

    @Column('json', { nullable: true })
    env_schema!: Record<string, unknown> | null;

    @Column('json', { nullable: true })
    port_schema!: Record<string, unknown> | null;
    @Column({ type: 'integer', nullable: true })
    port!: number | null;

    @Column({ type: 'varchar', length: 50, nullable: true })
    version!: string | null;

    @Column({ type: 'boolean', default: true })
    is_active!: boolean;

    @CreateDateColumn({ type: 'timestamp' })
    created_at!: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updated_at!: Date;
}
