import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Matches } from 'class-validator';

export class GetStockLogsDto {
  @ApiPropertyOptional({
    example: '2026-08-01',
    format: 'date',
    description: '한국 시간 기준 시작일 (YYYY-MM-DD)',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate는 YYYY-MM-DD 형식이어야 합니다.',
  })
  @IsDateString(
    { strict: true },
    { message: 'startDate는 유효한 날짜여야 합니다.' },
  )
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-08-11',
    format: 'date',
    description: '한국 시간 기준 종료일, 시작일과 같거나 이후 (YYYY-MM-DD)',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate는 YYYY-MM-DD 형식이어야 합니다.',
  })
  @IsDateString(
    { strict: true },
    { message: 'endDate는 유효한 날짜여야 합니다.' },
  )
  endDate?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  itemId?: number;
}
