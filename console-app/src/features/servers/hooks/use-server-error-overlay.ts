import { useEffect } from "react";
import {
  clearAppErrorSource,
  publishAppError,
} from "@/components/error-overlay/error-overlay-store";

/**
 * Shows a server's persisted connection error in the bottom-right error overlay.
 * The user can dismiss or collapse it; it clears automatically when the server
 * reconnects or the page is left.
 */
export function useServerErrorOverlay(
  serverId: string | undefined,
  message: string | null,
): void {
  useEffect(() => {
    if (!serverId) {
      return;
    }

    const source = `server:${serverId}`;
    if (!message) {
      clearAppErrorSource(source);
      return;
    }

    publishAppError({ message, source });

    return () => {
      clearAppErrorSource(source);
    };
  }, [serverId, message]);
}
