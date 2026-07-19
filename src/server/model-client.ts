import OpenAI from "openai";
import {
  parseTurnAnalysis,
  type TurnAnalysis,
  turnAnalysisResponseFormat,
} from "./model-analysis";
import {
  buildAnalyzerMessages,
  buildResponderMessages,
  type AnalyzeTurnInput,
  type RespondToTurnInput,
} from "./model-prompts";

export { parseTurnAnalysis } from "./model-analysis";
export {
  buildAnalyzerInstructions,
  buildResponderInstructions,
} from "./model-prompts";
export type { AnalyzeTurnInput, RespondToTurnInput } from "./model-prompts";

export interface ModelClient {
  analyzeTurn(input: AnalyzeTurnInput): Promise<TurnAnalysis>;
  streamResponse(input: RespondToTurnInput): AsyncIterable<string>;
}

export class OpenAICompatibleModelClient implements ModelClient {
  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
  ) {}

  async analyzeTurn(input: AnalyzeTurnInput): Promise<TurnAnalysis> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      stream: false,
      temperature: 0,
      response_format: turnAnalysisResponseFormat,
      messages: buildAnalyzerMessages(input),
    });

    const content = response.choices[0]?.message.content;
    if (!content) {
      throw new Error("The profile analyzer returned no structured output.");
    }
    return parseTurnAnalysis(content);
  }

  async *streamResponse(input: RespondToTurnInput): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      stream: true,
      temperature: 0.7,
      messages: buildResponderMessages(input),
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}

export function createModelClient(
  environment: Record<string, string | undefined> = process.env,
): ModelClient {
  const apiKey = environment.MODEL_API_KEY?.trim();
  const baseURL = environment.MODEL_BASE_URL?.trim();
  const model = environment.MODEL_NAME?.trim();
  const missing = [
    !apiKey && "MODEL_API_KEY",
    !baseURL && "MODEL_BASE_URL",
    !model && "MODEL_NAME",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing model configuration: ${missing.join(", ")}`);
  }

  return new OpenAICompatibleModelClient(
    new OpenAI({ apiKey, baseURL }),
    model as string,
  );
}
