import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";


@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(configService: ConfigService){
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // 요청의 Authorization: Bearer <토큰> 헤더에서 꺼내옴
            ignoreExpiration: false,  // 토큰이 만료되면 거부한다.
            secretOrKey: configService.get<string>('JWT_SECRET')!, // 로그인 시 토큰을 서명했던 것과 같은 비밀키로 서명이 유효한지 검증
        });
    }

    validate(payload: {sub: number; email: string }){ // 서명/만료 검증이 통과된 후에만 호출
        return { userId: payload.sub, email: payload.email};
    }
}
