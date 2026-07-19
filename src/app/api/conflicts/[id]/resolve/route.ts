import type {
  ApiError,
  ResolveConflictRequest,
} from "@/lib/api-contracts";
import { createModelClient } from "@/server/model-client";
import {
  applyConflictDecision,
  runConflictResolutionResponse,
} from "@/server/orchestrator";
import { ConflictNotFoundError } from "@/server/profile-updates";
import { createSseResponse } from "@/server/sse";
import { stateStore } from "@/server/state-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  let body: Partial<ResolveConflictRequest>;
  try {
    body = (await request.json()) as Partial<ResolveConflictRequest>;
  } catch {
    return Response.json({ error: "Invalid JSON request." } satisfies ApiError, {
      status: 400,
    });
  }

  if (body.decision !== "accept" && body.decision !== "reject") {
    return Response.json(
      { error: 'Decision must be either "accept" or "reject".' } satisfies ApiError,
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

  let turn;
  try {
    const { id } = await context.params;
    turn = await applyConflictDecision(id, body.decision, stateStore);
  } catch (error) {
    if (error instanceof ConflictNotFoundError) {
      return Response.json({ error: error.message } satisfies ApiError, {
        status: 404,
      });
    }

    console.error("Failed to resolve profile conflict", error);
    return Response.json(
      { error: "Unable to resolve the profile conflict." } satisfies ApiError,
      { status: 500 },
    );
  }

  return createSseResponse(
    runConflictResolutionResponse(turn, {
      modelClient,
      store: stateStore,
    }),
    {
      fallbackErrorMessage: "Atlas could not confirm that choice.",
      onError: (error) => console.error("Conflict response failed", error),
    },
  );
}
