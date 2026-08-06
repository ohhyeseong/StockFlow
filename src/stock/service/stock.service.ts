import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Stock } from "../entity/stock.entity";
import { Repository } from "typeorm";
import { Item } from "src/items/entity/item.entity";

@Injectable()
export class StockService {
    constructor(
        @InjectRepository(Stock)
        private readonly stockRepository: Repository<Stock>,
    ){}

    createInitialStock(item: Item) {
        const stock = this.stockRepository.create({ item, currentQuantity: 0});
        return this.stockRepository.save(stock);
    }

    findAll() {
        return this.stockRepository.find({ relations: { item: true } });
    }

    async findByItemId(itemId: number) {
        const stock = await this.stockRepository.findOne({
            where: {item: {id: itemId }},
            relations: { item: true },
        });
        if (!stock) {
            throw new NotFoundException(`itemId ${itemId}에 해당하는 재고 정보를 찾을 수 없습니다.`);
        }
        return stock;
    }
}