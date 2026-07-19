import type { DestinationInfo } from "../lib/domain";

// Per-turn tool output passed to the responder. It is never persisted.
export type DestinationLookupResult = {
  requestedName: string;
  info: DestinationInfo | null;
};

const destinations: Record<string, DestinationInfo> = {
  lisbon: {
    name: "Lisbon",
    bestSeasons: ["spring", "fall"],
    knownFor: ["food", "architecture", "coastal day trips"],
    averageDailyBudgetUSD: { budget: 75, midRange: 170, luxury: 350 },
    visaNotes: "Entry requirements depend on nationality and trip length.",
  },
  tokyo: {
    name: "Tokyo",
    bestSeasons: ["spring", "fall"],
    knownFor: ["food", "neighborhoods", "museums"],
    averageDailyBudgetUSD: { budget: 85, midRange: 190, luxury: 420 },
    visaNotes: "Entry requirements depend on nationality and trip length.",
  },
  kyoto: {
    name: "Kyoto",
    bestSeasons: ["spring", "fall"],
    knownFor: ["temples", "gardens", "traditional architecture"],
    averageDailyBudgetUSD: { budget: 75, midRange: 175, luxury: 380 },
    visaNotes: "Entry requirements depend on nationality and trip length.",
  },
  paris: {
    name: "Paris",
    bestSeasons: ["spring", "fall"],
    knownFor: ["art", "food", "architecture"],
    averageDailyBudgetUSD: { budget: 110, midRange: 250, luxury: 600 },
    visaNotes: "Entry requirements depend on nationality and trip length.",
  },
  "mexico city": {
    name: "Mexico City",
    bestSeasons: ["spring", "fall", "winter"],
    knownFor: ["food", "museums", "historic neighborhoods"],
    averageDailyBudgetUSD: { budget: 55, midRange: 130, luxury: 300 },
    visaNotes: "Entry requirements depend on nationality and trip length.",
  },
};

const destinationAliases: Record<string, keyof typeof destinations> = {
  lisboa: "lisbon",
  "lisbon portugal": "lisbon",
  "tokyo japan": "tokyo",
  "kyoto japan": "kyoto",
  "paris france": "paris",
  cdmx: "mexico city",
  "mexico city mexico": "mexico city",
};

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export async function getDestinationInfo(
  name: string,
): Promise<DestinationInfo | null> {
  const normalizedName = normalizeName(name);
  const canonicalName = destinationAliases[normalizedName] ?? normalizedName;
  return destinations[canonicalName] ?? null;
}
