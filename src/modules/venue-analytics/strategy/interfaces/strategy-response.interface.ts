export interface StrategyResponse {
  content: string;
  generatedAt: Date;
  validUntil: Date;
  canRegenerate: boolean;
  regenerateAvailableAt: Date | null;
}
