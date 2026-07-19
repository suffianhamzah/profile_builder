import type { ApiError, ChatRequest } from "@/lib/api-contracts";
import { createModelClient } from "@/server/model-client";
import { runChatTurn } from "@/server/orchestrator";
import { createSseResponse } from "@/server/sse";
import { stateStore } from "@/server/state-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: Partial<ChatRequest>;
  try {
    body = (await request.json()) as Partial<ChatRequest>;
  } catch {
    return Response.json({ error: "Request body must be JSON." } satisfies ApiError, {
      status: 400,
    });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return Response.json({ error: "Message is required." } satisfies ApiError, {
      status: 400,
    });
  }
  if (message.length > 4_000) {
    return Response.json(
      { error: "Message must be 4,000 characters or fewer." } satisfies ApiError,
      { status: 400 },
    );
  }
  if (
    body.resolvingConflictId !== undefined &&
    typeof body.resolvingConflictId !== "string"
  ) {
    return Response.json(
      { error: "Conflict ID must be a string." } satisfies ApiError,
      { status: 400 },
    );
  }

  let modelClient;
  try {
    modelClient = createModelClient();
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Model configuration is invalid.",
      } satisfies ApiError,
      { status: 500 },
    );
  }

  return createSseResponse(
    runChatTurn(
      { message, resolvingConflictId: body.resolvingConflictId },
      { modelClient, store: stateStore },
    ),
    {
      fallbackErrorMessage: "Atlas could not start that turn.",
    },
  );
}
