// Durable business objects. PersistedState is the complete JSON snapshot read
// and written by StateStore; other types here either live inside that snapshot
// or describe stable travel-domain data.

export const seasons = ["spring", "summer", "fall", "winter"] as const;
export type Season = (typeof seasons)[number];

export const budgetStyles = ["budget", "midRange", "luxury"] as const;
export type BudgetStyle = (typeof budgetStyles)[number];

export const travelPaces = ["relaxed", "balanced", "packed"] as const;
export type TravelPace = (typeof travelPaces)[number];

export const listProfileFields = [
  "wishlist",
  "visitedDestinations",
  "interests",
  "preferredSeasons",
  "dietaryPreferences",
  "accommodationPreferences",
  "additionalPreferences",
] as const;
export type ListProfileField = (typeof listProfileFields)[number];

export const scalarProfileFields = ["budgetStyle", "travelPace"] as const;
export type ScalarProfileField = (typeof scalarProfileFields)[number];
export type ProfileField = ScalarProfileField | ListProfileField;

export type TravelProfile = {
  budgetStyle?: BudgetStyle;
  travelPace?: TravelPace;
  wishlist: string[];
  visitedDestinations: string[];
  interests: string[];
  preferredSeasons: Season[];
  dietaryPreferences: string[];
  accommodationPreferences: string[];
  additionalPreferences: string[];
};

export type ScalarProfileOperation =
  | { kind: "set"; field: "budgetStyle"; value: BudgetStyle }
  | { kind: "set"; field: "travelPace"; value: TravelPace };

export type ListProfileOperation =
  | { kind: "add"; field: ListProfileField; values: string[] }
  | { kind: "remove"; field: ListProfileField; values: string[] };

// Operations are persisted inside pending conflicts so an approved change can
// be applied deterministically without asking the model to interpret it again.
export type ProfileOperation = ScalarProfileOperation | ListProfileOperation;

export type ProfileConflict = {
  id: string;
  field: ProfileField;
  existingValue: string;
  proposedValue: string;
  reason: string;
  proposedOperations: ProfileOperation[];
  createdAt: string;
};

export type ConflictDecision = "accept" | "reject";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type PersistedState = {
  profile: TravelProfile;
  messages: ChatMessage[];
  pendingConflicts: ProfileConflict[];
};

// DestinationInfo is stable tool reference data. It is compiled into the
// server, not written to PersistedState.
export type DestinationInfo = {
  name: string;
  bestSeasons: Season[];
  knownFor: string[];
  averageDailyBudgetUSD: {
    budget: number;
    midRange: number;
    luxury: number;
  };
  visaNotes?: string;
};

export function createEmptyProfile(): TravelProfile {
  return {
    wishlist: [],
    visitedDestinations: [],
    interests: [],
    preferredSeasons: [],
    dietaryPreferences: [],
    accommodationPreferences: [],
    additionalPreferences: [],
  };
}

export function createEmptyState(): PersistedState {
  return {
    profile: createEmptyProfile(),
    messages: [],
    pendingConflicts: [],
  };
}
