import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class StockOutDto {
  @ApiProperty({ example: 3, description: '출고할 품목 id' })
  @IsInt()
  itemId: number;

  @ApiProperty({ example: 5, description: '출고 수량' })
  @IsInt()
  @Min(1)
  quantity: number;
}
