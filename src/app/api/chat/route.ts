import type { ApiError, ChatRequest } from "@/lib/api-contracts";
import { createModelClient } from "@/server/model-client";
import { runChatTurn } from "@/server/orchestrator";
import { encodeSseEvent } from "@/server/sse";
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runChatTurn(
          { message, resolvingConflictId: body.resolvingConflictId },
          { modelClient, store: stateStore },
        )) {
          controller.enqueue(encoder.encode(encodeSseEvent(event)));
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            encodeSseEvent({
              type: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Atlas could not start that turn.",
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
