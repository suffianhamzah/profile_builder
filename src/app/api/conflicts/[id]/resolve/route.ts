import { NextResponse } from "next/server";
import type {
  ApiError,
  ResolveConflictRequest,
  ResolveConflictResponse,
} from "@/lib/contracts";
import { resolveConflict } from "@/server/profile-updates";
import { stateStore } from "@/server/state-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<ResolveConflictResponse | ApiError>> {
  try {
    const body = (await request.json()) as Partial<ResolveConflictRequest>;
    if (body.decision !== "accept" && body.decision !== "reject") {
      return NextResponse.json(
        { error: 'Decision must be either "accept" or "reject".' },
        { status: 400 },
      );
    }

    const { id } = await context.params;
    const state = resolveConflict(await stateStore.load(), id, body.decision);
    await stateStore.save(state);

    return NextResponse.json({ state });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Conflict not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("Failed to resolve profile conflict", error);
    return NextResponse.json(
      { error: "Unable to resolve the profile conflict." },
      { status: 500 },
    );
  }
}
