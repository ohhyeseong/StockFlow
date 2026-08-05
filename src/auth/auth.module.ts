import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from 'src/users/users.module';
import { AuthService } from './service/auth.service';
import { AuthController } from './controller/auth.controller';

@Module({
    imports: [
        UsersModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET'),
                signOptions: { expiresIn: Number(configService.get<string>('JWT_EXPIRES_IN')) },
            }),
        }),
    ],
    providers: [AuthService],
    controllers: [AuthController],
})
export class AuthModule {}
