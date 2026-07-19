import { NextResponse } from "next/server";
import type { ApiError } from "@/lib/api-contracts";
import type { PersistedState } from "@/lib/domain";
import { stateStore } from "@/server/state-store";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse<PersistedState | ApiError>> {
  try {
    return NextResponse.json(await stateStore.load());
  } catch (error) {
    console.error("Failed to load application state", error);
    return NextResponse.json(
      { error: "Unable to load the saved travel profile." },
      { status: 500 },
    );
  }
}
