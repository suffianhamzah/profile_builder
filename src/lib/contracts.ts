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

export type ProfileOperation = ScalarProfileOperation | ListProfileOperation;

export type SemanticConflictProposal = {
  field: ProfileField;
  existingValue: string;
  proposedValue: string;
  reason: string;
  proposedOperations: ProfileOperation[];
};

export type CustomConflictResolution = {
  conflictId: string;
  understood: boolean;
  summary: string;
  operations: ProfileOperation[];
};

export type TurnAnalysis = {
  operations: ProfileOperation[];
  semanticConflicts: SemanticConflictProposal[];
  mentionedDestinations: string[];
  customConflictResolution?: CustomConflictResolution;
};

export type ProfileConflict = {
  id: string;
  field: ProfileField;
  existingValue: string;
  proposedValue: string;
  reason: string;
  proposedOperations: ProfileOperation[];
  createdAt: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type AppState = {
  profile: TravelProfile;
  messages: Message[];
  pendingConflicts: ProfileConflict[];
};

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

export type DestinationLookupResult = {
  requestedName: string;
  info: DestinationInfo | null;
};

export type ChatRequest = {
  message: string;
  resolvingConflictId?: string;
};

export type ChatEvent =
  | {
      type: "state.updated";
      profile: TravelProfile;
      pendingConflicts: ProfileConflict[];
    }
  | { type: "assistant.delta"; text: string }
  | { type: "turn.completed"; assistantMessage: Message }
  | { type: "error"; message: string };

export type ResolveConflictRequest = {
  decision: "accept" | "reject";
};

export type ResolveConflictResponse = {
  state: AppState;
};

export type ClearStateRequest = {
  target: "conversation" | "profile";
};

export type ClearStateResponse = {
  state: AppState;
};

export type ApiError = {
  error: string;
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

export function createEmptyState(): AppState {
  return {
    profile: createEmptyProfile(),
    messages: [],
    pendingConflicts: [],
  };
}
