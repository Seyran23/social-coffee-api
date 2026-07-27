export interface CoreMetrics {
  totalVisits: number;
  distinctVisitors: number;
  newVisitors: number;
  returningVisitors: number;
  views: number;
  conversionRate: number | null;
  usersWith2PlusVisits: number;
  repeatRate: number;
}
