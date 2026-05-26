import type { IncomingMessage } from "node:http";

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function incomingMessageToRequest(
  req: IncomingMessage,
): Promise<Request> {
  const host = req.headers.host ?? "localhost:3000";
  const url = `http://${host}${req.url ?? "/"}`;
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const method = req.method ?? "GET";
  let body: Buffer | undefined;

  if (method !== "GET" && method !== "HEAD") {
    body = await readBody(req);
  }

  return new Request(url, {
    method,
    headers,
    body: body?.length ? new Uint8Array(body) : undefined,
  });
}

export async function sendWebResponse(
  res: import("node:http").ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      res.appendHeader(key, value);
    } else {
      res.setHeader(key, value);
    }
  });

  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }

  res.end();
}
