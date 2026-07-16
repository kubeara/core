import { Injectable, Logger } from "@nestjs/common";
import { UserEntity } from "./entities/users.entity";
import { FindOneOptions, Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { toErrorMessage } from "@control-panel/common/utils/error.util";

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async findOne(
    findOneOptions: FindOneOptions<UserEntity>,
  ): Promise<UserEntity | null> {
    try {
      const user = await this.userRepository.findOne(findOneOptions);
      return user;
    } catch (error) {
      this.logger.error(`Find user failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }
}
