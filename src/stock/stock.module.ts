import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Stock } from './entity/stock.entity';
import { StockService } from './service/stock.service';
import { StockController } from './controller/stock.controller';
import { StockLog } from './entity/stock-log.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Stock, StockLog])],
    providers: [StockService],
    controllers: [StockController],
    exports: [StockService],
})
export class StockModule {}
