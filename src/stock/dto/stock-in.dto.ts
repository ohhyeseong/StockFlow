import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class StockInDto {
  @ApiProperty({ example: 3, description: '입고할 품목 id' })
  @IsInt()
  itemId: number;

  @ApiProperty({ example: 10, description: '입고 수량' })
  @IsInt()
  @Min(1)
  quantity: number;
}
