import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemService } from './service/Items.service';
import { ItemsController } from './controller/Items.controller';
import { Item } from './entity/item.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Item])],
    providers: [ItemService],
    controllers: [ItemsController],
})
export class ItemsModule {}
