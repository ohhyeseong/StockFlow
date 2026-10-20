import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsInt, IsString, Min } from "class-validator";
import { MattressSize } from "../entity/item.entity";

export class CreateItemDto {
    @ApiProperty({ example: 'MY-DS-001', description: '품목 고유 코드' })
    @IsString()
    code: string;

    @ApiProperty({ example: '하이브리드 매트리스', description: '모델명' })
    @IsString()
    name: string;

    @ApiProperty({ enum: MattressSize, example: MattressSize.LQ })
    @IsEnum(MattressSize)
    size: MattressSize;

    @ApiProperty({ example: 10, description: '최소 재고 기준' })
    @IsInt()
    @Min(0)
    minStockQuantity: number;
}