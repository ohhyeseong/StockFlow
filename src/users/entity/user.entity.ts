import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

// 사용자

@Entity('users')
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    email: string;

    @Column()
    password: string;

    @Column()
    name: string;
}