import type { Plugin } from "vite";
import { handleApiRequest } from "./api-handler";
import { incomingMessageToRequest, sendWebResponse } from "./node-request";

export function apiMiddleware(): Plugin {
  return {
    name: "kubeara-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api")) {
          next();
          return;
        }

        try {
          const request = await incomingMessageToRequest(req);
          const response = await handleApiRequest(request);
          await sendWebResponse(res, response);
        } catch (error) {
          console.error("[api]", error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api")) {
          next();
          return;
        }

        try {
          const request = await incomingMessageToRequest(req);
          const response = await handleApiRequest(request);
          await sendWebResponse(res, response);
        } catch (error) {
          console.error("[api]", error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      });
    },
  };
}
