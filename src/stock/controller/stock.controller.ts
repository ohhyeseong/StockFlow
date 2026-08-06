import { Controller, Get, Param, ParseIntPipe, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "src/auth/guard/jwt-auth.guard";
import { StockService } from "../service/stock.service";

@ApiTags('stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stock')
export class StockController {
    constructor(private readonly stockService: StockService){}

    @Get()
    findAll() {
        return this.stockService.findAll();
    }

    @Get(':itemId')
    findByItemId(@Param('itemId', ParseIntPipe) itemId: number) {
        return this.stockService.findByItemId(itemId);
    }


}