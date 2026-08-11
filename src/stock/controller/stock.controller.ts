import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "src/auth/guard/jwt-auth.guard";
import { StockService } from "../service/stock.service";
import { StockInDto } from "../dto/stock-in.dto";
import { CurrentUser } from "src/auth/decorator/current-user.decorator";
import { userInfo } from "os";
import { StockOutDto } from "../dto/stock-out.dto";

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

    @Post('in')
    stockIn(@Body() dto: StockInDto, @CurrentUser() user: {userId: number; email: string}) {
        return this.stockService.stockIn(dto, user.userId);
    }

    @Post('out')
    stockOut(@Body() dto: StockOutDto, @CurrentUser() user: {userId: number; email: string}) {
        return this.stockService.stockOut(dto, user.userId);
    }


}