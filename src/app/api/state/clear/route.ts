import { NextRequest, NextResponse } from "next/server";

import type {
  ApiError,
  ClearStateRequest,
  ClearStateResponse,
} from "@/lib/api-contracts";
import { clearState } from "@/server/clear-state";
import { stateStore } from "@/server/state-store";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
): Promise<NextResponse<ClearStateResponse | ApiError>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  if (!isClearStateRequest(body)) {
    return NextResponse.json(
      { error: 'Target must be either "conversation" or "profile".' },
      { status: 400 },
    );
  }

  try {
    const state = clearState(await stateStore.load(), body.target);
    await stateStore.save(state);
    return NextResponse.json({ state });
  } catch (error) {
    console.error(`Failed to clear ${body.target}`, error);
    return NextResponse.json(
      { error: `Unable to clear the ${body.target}.` },
      { status: 500 },
    );
  }
}

function isClearStateRequest(value: unknown): value is ClearStateRequest {
  if (!value || typeof value !== "object" || !("target" in value)) return false;
  const target = (value as { target?: unknown }).target;
  return target === "conversation" || target === "profile";
}
