import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";

export class SignupDto {
    @ApiProperty({ example: 'test@example.com', description: '로그인 아이디로 사용할 이메일' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'password123', description: '사용자 비밀번호' })
    @IsString()
    @MinLength(8)
    password: string;

    @ApiProperty({ example: '홍길동', description: '사용자 이름' })
    @IsString()
    name: string;
}