import type { SourceLocation } from "@local-learning-studio/contracts";

export interface ExtractedPassage {
  content: string;
  location: SourceLocation;
}

export interface MaterialExtractor {
  extract(filePath: string): Promise<ExtractedPassage[]>;
}

