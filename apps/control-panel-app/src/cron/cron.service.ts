import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression, SchedulerRegistry } from "@nestjs/schedule";
import axios from "axios";
import { logStructured, logStructuredError } from "@shared/common";
import { CRON_AUTH_TOKEN_HEADER } from "./utils/cron-auth.util";
const CRON_AGENT_HEALTH_PATH = "/api/servers/cron/agent-health";
const CRON_JOB_AGENT_HEALTH = "agent-health-check";

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  /**
   * Skips cron jobs based on env configuration.
   * When IS_CRON_SERVER is not true, all jobs are removed.
   * When IS_CRON_SERVER is true, only jobs with their skip env explicitly set
   * to "true" are removed. Missing or unset skip env vars are treated as false.
   */
  skipCrons(): void {
    try {
      const isCronServer =
        this.configService.get<string>("IS_CRON_SERVER") === "true";
      logStructured(this.logger, "log", "cron.bootstrap", "started", {
        module: "CronService",
        isCronServer,
      });

      if (!isCronServer) {
        const jobNames = [...this.schedulerRegistry.getCronJobs().keys()];

        for (const jobName of jobNames) {
          this.schedulerRegistry.deleteCronJob(jobName);
        }

        logStructured(this.logger, "log", "cron.bootstrap", "skipped", {
          module: "CronService",
          reason: "IS_CRON_SERVER_not_true",
        });
      } else {
        const skipAgentHealthCheck =
          this.configService.get<string>("SKIP_CRON_AGENT_HEALTH_CHECK") ===
          "true";

        if (skipAgentHealthCheck) {
          if (this.schedulerRegistry.getCronJobs().has(CRON_JOB_AGENT_HEALTH)) {
            this.schedulerRegistry.deleteCronJob(CRON_JOB_AGENT_HEALTH);
            logStructured(this.logger, "log", "cron.agent_health", "skipped", {
              module: "CronService",
              reason: "SKIP_CRON_AGENT_HEALTH_CHECK_true",
            });
          }
        } else {
          logStructured(this.logger, "log", "cron.agent_health", "started", {
            module: "CronService",
            job: CRON_JOB_AGENT_HEALTH,
          });
        }
      }
    } catch (error) {
      logStructuredError(this.logger, "cron.bootstrap", error, {
        module: "CronService",
      });
      throw error;
    }
  }

  /**
   * Fires the internal agent-health tick every second.
   */
  @Cron(CronExpression.EVERY_SECOND, { name: CRON_JOB_AGENT_HEALTH })
  async runAgentHealthCheck(): Promise<void> {
    try {
      const cronAuthToken = this.configService.get<string>("CRON_AUTH_TOKEN");

      const baseUrl = this.configService.get<string>("CRON_URL");

      await axios.post(
        `${baseUrl}${CRON_AGENT_HEALTH_PATH}`,
        {},
        {
          timeout: 30_000,
          headers: {
            [CRON_AUTH_TOKEN_HEADER]: cronAuthToken,
          },
        },
      );
    } catch (error) {
      logStructuredError(this.logger, "cron.agent_health_request", error, {
        module: "CronService",
      });
    }
  }
}
