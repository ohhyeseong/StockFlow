import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString } from "class-validator";

export class LoginDto {
    @ApiProperty({ example: 'test@example.com', description: '로그인 이메일' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'password123', description: '사용자 비밀번호' })
    @IsString()
    password: string;
}