import {
    BeforeInsert,
    BeforeSoftRemove,
    BeforeUpdate,
    Column,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import dayjs from 'dayjs';

export enum EntityStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
}

export abstract class BaseEntity {
    @IsUUID()
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @IsEnum(EntityStatus)
    @Column({
        type: 'varchar',
        enum: EntityStatus,
        enumName: 'entityStatusEnum',
        default: EntityStatus.ACTIVE,
    })
    status!: EntityStatus;

    @IsOptional()
    @Column({
        type: 'jsonb',
        nullable: true,
    })
    metadata!: Record<string, unknown> | null;

    @Column({ type: 'bigint' })
    createdAt!: number;

    @Column({ type: 'bigint' })
    updatedAt!: number;

    @Column({ type: 'bigint', nullable: true })
    deletedAt!: number | null;

    @BeforeInsert()
    setCreatedAt() {
        const now = dayjs().unix();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @BeforeUpdate()
    setUpdatedAt() {
        this.updatedAt = dayjs().unix();
    }

    @BeforeSoftRemove()
    setDeletedAt() {
        this.deletedAt = dayjs().unix();
        this.status = EntityStatus.INACTIVE;
    }
}
