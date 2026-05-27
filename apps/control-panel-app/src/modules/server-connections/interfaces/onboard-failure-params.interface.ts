import { OnboardStep } from "../enums/onboard-step.enum";

export interface OnboardFailureParams {
  message: string;
  error: string;
  code: string;
  logs: string[];
  step?: OnboardStep;
}
