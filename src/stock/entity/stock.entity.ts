import { Item } from "src/items/entity/item.entity";
import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

// 재고 관리용

@Entity()
export class Stock {
    @PrimaryGeneratedColumn()
    id: number;

    @OneToOne(() => Item, { onDelete: 'CASCADE'})
    @JoinColumn({ name: 'item_id' })
    item: Item;

    @Column({ name: 'current_quantity' })
    currentQuantity: number;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}