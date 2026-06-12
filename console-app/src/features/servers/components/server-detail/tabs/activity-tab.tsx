import { useMemo } from "react";
import { getServerActivity } from "@/lib/server-detail-data";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { activityIcon } from "../utils/activity-icon";

type ServerActivityTabProps = {
  serverId: string;
  serverName: string;
};

export function ServerActivityTab({
  serverId,
  serverName,
}: ServerActivityTabProps) {
  const activity = useMemo(
    () => getServerActivity(serverId, serverName),
    [serverId, serverName],
  );

  return (
    <div className="server-detail-panel">
      <h2 className="server-detail-section-title">Recent activity</h2>
      <p className="server-detail-section-desc">
        Deployments, configuration changes, and alerts for this server.
      </p>
      <div className="activity-feed">
        {activity.map((entry) => (
          <div key={entry.id} className="activity-item">
            <span
              className={`activity-icon activity-icon-${entry.kind}`}
              aria-hidden
            >
              {activityIcon(entry.kind)}
            </span>
            <div className="activity-body">
              <strong>{entry.title}</strong>
              <p>{entry.detail}</p>
            </div>
            <time className="activity-time" dateTime={entry.timestamp}>
              {formatRelativeTime(entry.timestamp)}
            </time>
          </div>
        ))}
      </div>
    </div>
  );
}
