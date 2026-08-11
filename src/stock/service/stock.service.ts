import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Stock } from "../entity/stock.entity";
import { Repository } from "typeorm";
import { Item } from "src/items/entity/item.entity";
import { StockLog, StockLogType } from "../entity/stock-log.entity";
import { StockInDto } from "../dto/stock-in.dto";

@Injectable()
export class StockService {
    constructor(
        @InjectRepository(Stock)
        private readonly stockRepository: Repository<Stock>,
        @InjectRepository(StockLog)
        private readonly stockLogRepository: Repository<StockLog>,
    ){}

    async stockIn(dto: StockInDto, userId: number) {
        const stock = await this.stockRepository.findOne({
            where: {item: {id: dto.itemId}},
            relations: {item: true},
        });

        if(!stock) {
            throw new NotFoundException(`itemId ${dto.itemId}에 해당하는 재고 정보를 찾을 수 없습니다.`);
        }

        await this.stockRepository.increment({ id: stock.id}, `currentQuantity`, dto.quantity);

        const updatedStock = await this.stockRepository.findOne({ where: {id: stock.id}});

        const log = this.stockLogRepository.create({
            item: stock.item,
            user: {id: userId} as any,
            type: StockLogType.IN,
            quantity: dto.quantity,
            stockAfter: updatedStock!.currentQuantity,
        });
        await this.stockLogRepository.save(log);

        return updatedStock;
    }

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