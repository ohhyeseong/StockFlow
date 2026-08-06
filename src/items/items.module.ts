import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemService } from './service/Items.service';
import { ItemsController } from './controller/Items.controller';
import { Item } from './entity/item.entity';
import { StockModule } from 'src/stock/stock.module';

@Module({
    imports: [TypeOrmModule.forFeature([Item]), StockModule],
    providers: [ItemService],
    controllers: [ItemsController],
})
export class ItemsModule {}
