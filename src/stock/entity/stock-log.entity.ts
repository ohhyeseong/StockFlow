import { Item } from "src/items/entity/item.entity";
import { User } from "src/users/entity/user.entity";
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

export enum StockLogType {
    IN = 'IN',
    OUT = 'OUT',
}

// 재고 로그 기록용

@Entity()
export class StockLog {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Item)
    @JoinColumn({ name: 'item_id' })
    item: Item;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ type: 'enum', enum: StockLogType })
    type: StockLogType;

    @Column()
    quantity: number;

    @Column({ name: 'stock_after' })
    stockAfter: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}