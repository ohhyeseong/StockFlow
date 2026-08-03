import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";


export enum MattressSize {
    DS = 'DS',
    SS = 'SS',
    LQ = 'LQ',
    K = 'K',
    LK = 'LK',
}

@Entity()
export class Item {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    code: string;

    @Column()
    name: string;

    @Column({ type: 'enum', enum: MattressSize})
    size: MattressSize;

    @Column({ name: 'min_stock_quantity' })
    minStockQuantity: number;
}