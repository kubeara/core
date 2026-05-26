import {
  changePasswordWithCurrent,
  consumeResetToken,
  createResetToken,
  registerUser,
  toPublicUser,
  updateOrganization,
  updatePassword,
  updateUserProfile,
  validateUser,
} from "../lib/auth-store";
import { buildDeployLogSequence, delay } from "../lib/deploy-logs";
import {
  clearSessionOnResponse,
  getSessionUserFromRequest,
  setSessionOnResponse,
} from "../lib/session";
import {
  createServer,
  deleteServer,
  getServerById,
  listServers,
  updateServer,
} from "../lib/server-store";
import { getTemplateById } from "../lib/templates";
import type { ServerStatus } from "../lib/types";

const VALID_STATUSES: ServerStatus[] = ["online", "offline", "pending", "error"];

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export async function handleApiRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;

  if (pathname === "/api/auth/login" && method === "POST") {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };
    const email = body.email?.trim();
    const password = body.password;

    if (!email || !password) {
      return json({ error: "Email and password are required." }, 400);
    }

    const user = validateUser(email, password);
    if (!user) {
      return json({ error: "Invalid email or password." }, 401);
    }

    return setSessionOnResponse(
      json({ user: toPublicUser(user) }),
      user.email,
    );
  }

  if (pathname === "/api/auth/register" && method === "POST") {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };

    const email = body.email?.trim();
    const password = body.password;
    const name = body.name?.trim() ?? "";

    if (!email || !password || !name) {
      return json({ error: "Name, email, and password are required." }, 400);
    }

    if (password.length < 8) {
      return json({ error: "Password must be at least 8 characters." }, 400);
    }

    const result = registerUser(email, password, name);
    if (!result.ok) {
      return json({ error: result.error }, 409);
    }

    return setSessionOnResponse(
      json({ user: toPublicUser(result.user) }),
      result.user.email,
    );
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    return clearSessionOnResponse(json({ ok: true }));
  }

  if (pathname === "/api/auth/me" && method === "GET") {
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }
    return json({ user });
  }

  if (pathname === "/api/profile/general" && method === "PATCH") {
    const sessionUser = await getSessionUserFromRequest(request);
    if (!sessionUser) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = (await request.json()) as {
      firstName?: string;
      lastName?: string;
      profilePicture?: string | null;
    };

    const firstName = body.firstName?.trim() ?? "";
    const lastName = body.lastName?.trim() ?? "";

    if (!firstName) {
      return json({ error: "First name is required." }, 400);
    }

    const updated = updateUserProfile(sessionUser.email, {
      firstName,
      lastName,
      profilePicture: body.profilePicture,
    });

    if (!updated) {
      return json({ error: "User not found." }, 404);
    }

    return json({ user: toPublicUser(updated) });
  }

  if (pathname === "/api/profile/password" && method === "POST") {
    const sessionUser = await getSessionUserFromRequest(request);
    if (!sessionUser) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = (await request.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };

    const currentPassword = body.currentPassword ?? "";
    const newPassword = body.newPassword ?? "";

    if (!currentPassword || !newPassword) {
      return json(
        { error: "Current and new password are required." },
        400,
      );
    }

    const result = changePasswordWithCurrent(
      sessionUser.email,
      currentPassword,
      newPassword,
    );

    if (!result.ok) {
      return json({ error: result.error }, 400);
    }

    return json({ message: "Password updated successfully." });
  }

  if (pathname === "/api/profile/organization" && method === "PATCH") {
    const sessionUser = await getSessionUserFromRequest(request);
    if (!sessionUser) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = (await request.json()) as {
      orgName?: string;
      orgLogo?: string | null;
    };

    const orgName = body.orgName?.trim() ?? "";
    if (!orgName) {
      return json({ error: "Organization name is required." }, 400);
    }

    const updated = updateOrganization(sessionUser.email, {
      orgName,
      orgLogo: body.orgLogo,
    });

    if (!updated) {
      return json({ error: "User not found." }, 404);
    }

    return json({ user: toPublicUser(updated) });
  }

  if (pathname === "/api/auth/forgot-password" && method === "POST") {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim();

    if (!email) {
      return json({ error: "Email is required." }, 400);
    }

    const token = createResetToken(email);

    const response: { message: string; resetLink?: string } = {
      message:
        "If an account exists for this email, you will receive reset instructions.",
    };

    if (token) {
      response.resetLink = `${url.origin}/reset-password?token=${token}`;
    }

    return json(response);
  }

  if (pathname === "/api/auth/reset-password" && method === "POST") {
    const body = (await request.json()) as {
      token?: string;
      password?: string;
    };

    const token = body.token?.trim();
    const password = body.password;

    if (!token || !password) {
      return json({ error: "Token and password are required." }, 400);
    }

    if (password.length < 8) {
      return json({ error: "Password must be at least 8 characters." }, 400);
    }

    const entry = consumeResetToken(token);
    if (!entry) {
      return json({ error: "Invalid or expired reset link." }, 400);
    }

    updatePassword(entry.email, password);
    return json({ message: "Password updated successfully." });
  }

  if (pathname === "/api/servers" && method === "GET") {
    return json({ servers: listServers() });
  }

  if (pathname === "/api/servers" && method === "POST") {
    const body = (await request.json()) as {
      name?: string;
      username?: string;
      host?: string;
      status?: ServerStatus;
    };

    const name = body.name?.trim();
    const username = body.username?.trim();
    const host = body.host?.trim();
    const status = body.status;

    if (!name || !username || !host) {
      return json({ error: "Name, username, and host are required." }, 400);
    }

    if (!status || !VALID_STATUSES.includes(status)) {
      return json({ error: "Invalid status." }, 400);
    }

    const server = createServer({ name, username, host, status });
    return json({ server }, 201);
  }

  const serverMatch = pathname.match(/^\/api\/servers\/([^/]+)$/);
  if (serverMatch) {
    const id = serverMatch[1];

    if (method === "GET") {
      const server = getServerById(id);
      if (!server) {
        return json({ error: "Server not found." }, 404);
      }
      return json({ server });
    }

    if (method === "PUT") {
      const body = (await request.json()) as {
        name?: string;
        username?: string;
        host?: string;
        status?: ServerStatus;
      };

      if (body.status && !VALID_STATUSES.includes(body.status)) {
        return json({ error: "Invalid status." }, 400);
      }

      const server = updateServer(id, body);
      if (!server) {
        return json({ error: "Server not found." }, 404);
      }

      return json({ server });
    }

    if (method === "DELETE") {
      const deleted = deleteServer(id);
      if (!deleted) {
        return json({ error: "Server not found." }, 404);
      }
      return json({ ok: true });
    }
  }

  const deployMatch = pathname.match(/^\/api\/deploy\/([^/]+)\/logs$/);
  if (deployMatch && method === "GET") {
    const templateId = deployMatch[1];
    const template = getTemplateById(templateId);

    if (!template) {
      return json({ error: "Template not found" }, 404);
    }

    const logs = buildDeployLogSequence(template.id, template.name);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sseMessage = (data: Record<string, unknown>) =>
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

        const formatTimestamp = () =>
          new Date().toISOString().replace("T", " ").slice(0, 19);

        try {
          controller.enqueue(
            sseMessage({
              type: "connected",
              templateId: template.id,
              templateName: template.name,
              timestamp: formatTimestamp(),
            }),
          );

          for (let i = 0; i < logs.length; i++) {
            if (request.signal.aborted) break;

            await delay(400 + Math.random() * 350, request.signal);

            controller.enqueue(
              sseMessage({
                type: "log",
                index: i,
                level: logs[i].level,
                message: logs[i].message,
                timestamp: formatTimestamp(),
              }),
            );
          }

          if (!request.signal.aborted) {
            controller.enqueue(
              sseMessage({
                type: "complete",
                timestamp: formatTimestamp(),
              }),
            );
          }
        } catch {
          if (!request.signal.aborted) {
            controller.enqueue(
              sseMessage({
                type: "error",
                message: "Log stream interrupted.",
                timestamp: formatTimestamp(),
              }),
            );
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  return json({ error: "Not found" }, 404);
}
