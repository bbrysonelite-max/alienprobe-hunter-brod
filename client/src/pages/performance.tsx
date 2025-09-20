import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  ArrowLeft, 
  Activity, 
  Satellite, 
  DollarSign, 
  Target, 
  Zap, 
  TrendingUp, 
  Users, 
  Mail, 
  BarChart3,
  RefreshCw
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface AnalyticsResponse {
  success: boolean;
  data: {
    date: string;
    timestamp: string;
    revenue: {
      todayCents: number;
      todayDollars: number;
      goalCents: number;
      goalDollars: number;
      progressPercent: number;
      remaining: number;
      isGoalMet: boolean;
    };
    scans: {
      total: number;
      completed: number;
      pending: number;
      failed: number;
    };
    emails: {
      total: number;
      sent: number;
      pending: number;
      failed: number;
    };
    performance: {
      conversionRate: number;
      paymentsCount: number;
      averageOrderValue: number;
    };
  };
}

export default function PerformancePage() {
  const { data: response, isLoading, error, isRefetching } = useQuery<AnalyticsResponse>({
    queryKey: ['/api/analytics/daily'],
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchIntervalInBackground: true,
    staleTime: 0, // Always fetch fresh data
  });

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const metrics = response?.data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation Header */}
      <nav className="bg-card border-b border-border sticky top-0 z-50 backdrop-blur-sm bg-card/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Satellite className="text-primary-foreground w-4 h-4" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">AlianProbe.ai</h1>
                  <p className="text-xs text-muted-foreground">Performance Dashboard</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                {isRefetching && (
                  <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />
                )}
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20">
                  <Activity className="w-3 h-3 text-accent mr-1.5" />
                  Live Data
                </span>
              </div>
              <Link href="/">
                <Button variant="outline" size="sm" data-testid="button-back-home">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Scanner
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-xl mb-6">
            <BarChart3 className="text-primary-foreground w-8 h-8" />
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Performance Dashboard
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Real-time business performance tracking with daily revenue goals and comprehensive analytics.
          </p>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading performance data...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-12">
            <Card className="bg-destructive/10 border-destructive/20 max-w-md mx-auto">
              <CardContent className="pt-6">
                <p className="text-destructive font-medium">Failed to load performance data</p>
                <p className="text-sm text-muted-foreground mt-2">Please try refreshing the page</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Dashboard Content */}
        {metrics && (
          <div className="space-y-8">
            {/* Revenue Goal Section */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-2xl font-semibold text-foreground flex items-center">
                  <Target className="text-primary mr-3" />
                  Daily Revenue Goal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-3xl font-bold text-foreground">
                        {formatCurrency(metrics.revenue.todayCents)}
                      </h3>
                      <p className="text-muted-foreground">
                        of {formatCurrency(metrics.revenue.goalCents)} goal
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge variant={metrics.revenue.isGoalMet ? "default" : "secondary"} className="text-lg px-3 py-1">
                        {formatPercentage(metrics.revenue.progressPercent)}
                      </Badge>
                      {metrics.revenue.isGoalMet && (
                        <p className="text-sm text-green-600 mt-1 font-medium">🎉 Goal Achieved!</p>
                      )}
                    </div>
                  </div>
                  <Progress 
                    value={Math.min(metrics.revenue.progressPercent, 100)} 
                    className="h-3"
                    data-testid="progress-revenue-goal"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Performance Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Conversions Card */}
              <Card className="bg-card border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Conversions</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-conversions-count">
                    {metrics.performance.paymentsCount}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatPercentage(metrics.performance.conversionRate)} conversion rate
                  </p>
                </CardContent>
              </Card>

              {/* Total Scans Card */}
              <Card className="bg-card border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Scans</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-scans-total">
                    {metrics.scans.total}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {metrics.scans.completed} completed, {metrics.scans.pending} pending
                  </p>
                </CardContent>
              </Card>

              {/* Emails Card */}
              <Card className="bg-card border-border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Email Activity</CardTitle>
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-emails-sent">
                    {metrics.emails.sent}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {metrics.emails.pending} pending, {metrics.emails.failed} failed
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Insights */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-xl font-semibold text-foreground flex items-center">
                  <Activity className="text-primary mr-3" />
                  Today's Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-medium text-foreground">Revenue Performance</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Current Revenue:</span>
                        <span className="text-sm font-medium">{formatCurrency(metrics.revenue.todayCents)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Daily Goal:</span>
                        <span className="text-sm font-medium">{formatCurrency(metrics.revenue.goalCents)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Remaining:</span>
                        <span className="text-sm font-medium">
                          {formatCurrency(metrics.revenue.remaining)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="font-medium text-foreground">Business Activity</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Completed Scans:</span>
                        <span className="text-sm font-medium">{metrics.scans.completed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Failed Scans:</span>
                        <span className="text-sm font-medium">{metrics.scans.failed}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Avg Order Value:</span>
                        <span className="text-sm font-medium">
                          {formatCurrency(metrics.performance.averageOrderValue)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}