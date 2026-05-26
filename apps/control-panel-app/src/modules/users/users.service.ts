import { Injectable } from "@nestjs/common";
import { UserEntity } from "./entities/users.entity";
import { FindOneOptions, Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async findOne(
    findOneOptions: FindOneOptions<UserEntity>,
  ): Promise<UserEntity | null> {
    const user = await this.userRepository.findOne(findOneOptions);
    return user;
  }
}
