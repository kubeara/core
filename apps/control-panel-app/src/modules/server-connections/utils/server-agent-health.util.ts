import dayjs from "dayjs";
import { Repository } from "typeorm";

import { ServerEntity } from "../entities/server.entity";
import { AgentHealthError } from "../interfaces/agent-health-error.interface";

export type ServerAgentHealthUpdateFields = Partial<
  Pick<ServerEntity, "lastAgentCheckedAt" | "retryCount"> & {
    agentError: AgentHealthError | null;
  }
>;

/**
 * Updates agent health columns on a server row using TypeORM `update`.
 *
 * @param repository - TypeORM repository for `servers`.
 * @param serverId - UUID of the server row to update.
 * @param fields - Agent health columns to persist.
 * @returns Resolves when the update completes.
 */
export async function updateServerAgentHealthFields(
  repository: Repository<ServerEntity>,
  serverId: string,
  fields: ServerAgentHealthUpdateFields,
): Promise<void> {
  const payload: Record<string, unknown> = {
    ...fields,
    updatedAt: dayjs().unix(),
  };

  if (fields.agentError !== undefined) {
    payload.agentError = fields.agentError
      ? { ...fields.agentError }
      : null;
  }

  await repository.update(serverId, payload);
}

/**
 * Returns the current timestamp in milliseconds via dayjs.
 *
 * @returns Unix epoch milliseconds.
 */
export function agentHealthTimestampMs(): number {
  return dayjs().valueOf();
}
