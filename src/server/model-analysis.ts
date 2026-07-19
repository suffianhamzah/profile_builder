import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  budgetStyles,
  listProfileFields,
  scalarProfileFields,
  travelPaces,
  type ProfileOperation,
} from "../lib/domain";

const listOperationSchema = z.strictObject({
  kind: z.enum(["add", "remove"]),
  field: z.enum(listProfileFields),
  values: z.array(z.string()),
});

const profileOperationSchema = z.union([
  z.strictObject({
    kind: z.literal("set"),
    field: z.literal("budgetStyle"),
    value: z.enum(budgetStyles),
  }),
  z.strictObject({
    kind: z.literal("set"),
    field: z.literal("travelPace"),
    value: z.enum(travelPaces),
  }),
  listOperationSchema,
]);

const semanticConflictSchema = z.strictObject({
  field: z.enum([...scalarProfileFields, ...listProfileFields]),
  existingValue: z.string(),
  proposedValue: z.string(),
  reason: z.string(),
  proposedOperations: z.array(profileOperationSchema),
});

const customConflictResolutionSchema = z.strictObject({
  conflictId: z.string(),
  understood: z.boolean(),
  summary: z.string(),
  operations: z.array(profileOperationSchema),
});

const turnAnalysisSchema = z.strictObject({
  operations: z.array(profileOperationSchema),
  semanticConflicts: z.array(semanticConflictSchema),
  mentionedDestinations: z.array(z.string()),
  customConflictResolution: customConflictResolutionSchema.nullable(),
});

type ParsedTurnAnalysis = z.infer<typeof turnAnalysisSchema>;
export type SemanticConflictProposal = z.infer<
  typeof semanticConflictSchema
>;
export type CustomConflictResolution = z.infer<
  typeof customConflictResolutionSchema
>;
export type TurnAnalysis = Omit<
  ParsedTurnAnalysis,
  "customConflictResolution"
> & {
  customConflictResolution?: CustomConflictResolution;
};

export const turnAnalysisResponseFormat = zodResponseFormat(
  turnAnalysisSchema,
  "travel_profile_turn_analysis",
);

export function parseTurnAnalysis(content: string): TurnAnalysis {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("The profile analyzer returned invalid JSON.");
  }

  const result = turnAnalysisSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      "The profile analyzer returned an invalid structured result.",
    );
  }

  const { customConflictResolution, ...analysis } = result.data;
  return {
    ...analysis,
    operations: normalizeOperations(analysis.operations),
    semanticConflicts: analysis.semanticConflicts.map((conflict) => ({
      ...conflict,
      proposedOperations: normalizeOperations(conflict.proposedOperations),
    })),
    mentionedDestinations: normalizeStrings(analysis.mentionedDestinations),
    ...(customConflictResolution
      ? {
          customConflictResolution: {
            ...customConflictResolution,
            operations: normalizeOperations(customConflictResolution.operations),
          },
        }
      : {}),
  };
}

function normalizeOperations(
  operations: ProfileOperation[],
): ProfileOperation[] {
  return operations.map((operation) =>
    operation.kind === "set"
      ? operation
      : { ...operation, values: normalizeStrings(operation.values) },
  );
}

function normalizeStrings(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
