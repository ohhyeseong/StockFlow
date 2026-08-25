import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { Item } from "../entity/item.entity";
import { DataSource, QueryFailedError, Repository } from "typeorm";
import { UpdateItemDto } from "../dto/update-dto";
import { CreateItemDto } from "../dto/create-item.dto";
import { StockService } from "src/stock/service/stock.service";

@Injectable()
export class ItemService {
    constructor(
        @InjectRepository(Item)
        private readonly itemRepository: Repository<Item>,
        private readonly stockService: StockService,
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) {}

    async create(dto: CreateItemDto) {
        try {
            return await this.dataSource.transaction(async (manager) => {
                const item = manager.create(Item, dto);
                const savedItem = await manager.save(item);
                await this.stockService.createInitialStock(savedItem, manager);
                return savedItem;
            });
        } catch (e) {
            if (e instanceof QueryFailedError && (e.driverError as any)?.code === 'ER_DUP_ENTRY') {
                throw new ConflictException('이미 존재하는 품목 코드입니다.');
            }
            throw e;
        }
    }
    findAll() {
        return this.itemRepository.find();
    }

    async findOne(id: number) {
        const item = await this.itemRepository.findOne({ where: { id }});
        if(!item) {
            throw new NotFoundException(`id ${id}에 해당하는 품목을 찾을 수 없습니다.`);
        }
        return item;
    }

    async update(id: number, dto: UpdateItemDto) {
        const item = await this.findOne(id);
        Object.assign(item, dto);
        try {
            return await this.itemRepository.save(item);
        } catch (e) {
            if (e instanceof QueryFailedError && (e.driverError as any)?.code === 'ER_DUP_ENTRY') {
                throw new ConflictException('이미 존재하는 품목 코드입니다.');
            }
            throw e;
        }
    }

    async remove(id: number) {
        const item = await this.findOne(id);
        await this.itemRepository.remove(item);
    }
}