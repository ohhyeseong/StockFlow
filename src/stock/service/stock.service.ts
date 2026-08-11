import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { Stock } from "../entity/stock.entity";
import { Repository } from "typeorm";
import { Item } from "src/items/entity/item.entity";
import { StockLog, StockLogType } from "../entity/stock-log.entity";
import { StockInDto } from "../dto/stock-in.dto";
import { StockOutDto } from "../dto/stock-out.dto";
import { DataSource } from "typeorm/browser";

@Injectable()
export class StockService {
    constructor(
        @InjectRepository(Stock)
        private readonly stockRepository: Repository<Stock>,
        @InjectRepository(StockLog)
        private readonly stockLogRepository: Repository<StockLog>,
        @InjectDataSource()
        private readonly dataSource: DataSource,
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

    async stockOut(dto: StockOutDto, userId: number) {
        return this.dataSource.transaction(async (manager) => {
            const stock = await manager.findOne(Stock, {
                where: {item: {id: dto.itemId}},
                relations: {item: true},
                lock: {mode: 'pessimistic_write'},
            });

            if(!stock) {
                throw new NotFoundException(`itemId ${dto.itemId}에 해당하는 재고 정보를 찾을 수 없습니다.`);
            }

            if (stock.currentQuantity < dto.quantity) {
                throw new BadRequestException(
                    `재고가 부족합니다. (현재 재고: ${stock.currentQuantity}, 요청 수량: ${dto.quantity})`,
                );
            }

            stock.currentQuantity -= dto.quantity;
            await manager.save(stock);

            const log = manager.create(StockLog, {
                item: stock.item,
                user: {id: userId} as any,
                type: StockLogType.OUT,
                quantity: dto.quantity,
                stockAfter: stock.currentQuantity,
            });
            await manager.save(log);

            return {
                id: stock.id,
                itemId: stock.item.id,
                currentQuantity: stock.currentQuantity,
                lowStockWarning: stock.currentQuantity <= stock.item.minStockQuantity,
            };
        });
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