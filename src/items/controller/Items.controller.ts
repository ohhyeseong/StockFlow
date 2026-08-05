import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { ItemService } from "../service/Items.service";
import { CreateItemDto } from "../dto/create-item.dto";
import { UpdateItemDto } from "../dto/update-dto";

@ApiTags('Items')
@Controller('items')
export class ItemsController {
    constructor(
        private readonly itemService: ItemService
    ){}

    @Post()
    create(@Body() dto: CreateItemDto) {
        return this.itemService.create(dto);
    }

    @Get()
    findAll() {
        return this.itemService.findAll();
    }

    @Get(':itemId')
    findOne(@Param('itemId', ParseIntPipe) itemId: number) {
        return this.itemService.findOne(itemId);
    }

    @Patch(':itemId')
    update(@Param('itemId', ParseIntPipe) itemId: number, @Body() dto: UpdateItemDto) {
        return this.itemService.update(itemId, dto);
    }

    @Delete(':itemId')
    remove(@Param('itemId', ParseIntPipe) itemId: number) {
        return this.itemService.remove(itemId);
    }
}