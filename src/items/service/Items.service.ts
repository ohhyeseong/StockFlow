import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Item } from "../entity/item.entity";
import { QueryFailedError, Repository } from "typeorm";
import { UpdateItemDto } from "../dto/update-dto";
import { CreateItemDto } from "../dto/create-item.dto";

@Injectable()
export class ItemService {
    constructor(
        @InjectRepository(Item)
        private readonly itemRepository: Repository<Item>,
    ) {}

    async create(dto: CreateItemDto) {
        try {
            const item = this.itemRepository.create(dto);
            return await this.itemRepository.save(item);
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
        return this.itemRepository.save(item);
    }

    async remove(id: number) {
        const item = await this.findOne(id);
        await this.itemRepository.remove(item);
    }
}