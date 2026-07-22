import { IsEmail, IsIn, IsNotEmpty, IsString } from "class-validator";

import {
  SUPPORT_TOPICS,
  type SupportTopic,
} from "../constants/support-topic.constants";

export class SubmitSupportRequestDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsIn(SUPPORT_TOPICS)
  topic!: SupportTopic;

  @IsString()
  @IsNotEmpty()
  message!: string;
}
