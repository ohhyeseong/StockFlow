import { ConflictException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { User } from "../entity/user.entity";
import { QueryFailedError, Repository } from "typeorm";

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
    ) {}

    findByEmail(email: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { email } });
    }

    async create(data: { email: string; password: string; name: string }): Promise<User> {
        try {
            const user = this.userRepository.create(data);
            return await this.userRepository.save(user);
        } catch (e) {
            if(e instanceof QueryFailedError && (e.driverError as any)?.code === 'ER_DUP_ENTRY') {
                throw new ConflictException('이미 가입된 이메일 입니다.');
            }
            throw e;
        }
        
    }
}