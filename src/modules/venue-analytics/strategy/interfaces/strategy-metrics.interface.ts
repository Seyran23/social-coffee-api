export interface StrategyMetrics {
  totalVisits: number;
  newVisitors: number;
  returningVisitors: number;
  conversionRate: number | null;
  repeatRate: number;
  quietHours: number[];
  topAgeBucket: string | null;
  lastCampaign: { name: string; visitLift: number | null } | null;
}
