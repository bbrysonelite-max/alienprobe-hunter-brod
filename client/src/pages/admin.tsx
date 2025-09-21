import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { 
  Activity, 
  Database, 
  DollarSign, 
  Play, 
  RefreshCw, 
  Settings, 
  TrendingUp,
  Users,
  Zap
} from 'lucide-react';

interface SystemOverview {
  metrics: {
    totalLeads: number;
    totalScans: number;
    huntRuns: number;
    pipelineRuns: number;
  };
  revenue: {
    totalScans: number;
    scanRevenue: number;
    estimatedMonthlyCommissions: number;
    totalPotential: number;
  };
  systemHealth: {
    database: string;
    emailSystem: string;
    hunterJobs: number;
    activeJobs: number;
  };
  version: string;
  environment: string;
  uptime: number;
}

interface DeployStatus {
  deployReady: boolean;
  checks: {
    database: boolean;
    migrations: boolean;
    services: boolean;
  };
  message: string;
}

export default function AdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // System overview query
  const { data: overview, isLoading } = useQuery<{ success: boolean; overview: SystemOverview }>({
    queryKey: ['/api/admin/overview'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Deploy status query
  const { data: deployStatus } = useQuery<{ success: boolean } & DeployStatus>({
    queryKey: ['/api/admin/deploy-status'],
    refetchInterval: 60000 // Refresh every minute
  });

  // Restart hunters mutation
  const restartHunters = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/restart-hunters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Failed to restart hunters');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Hunter system restarted successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/overview'] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to restart hunter system', variant: 'destructive' });
    }
  });

  // Cleanup mutation
  const cleanup = useMutation({
    mutationFn: async (action: string) => {
      const response = await fetch('/api/admin/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, confirm: true })
      });
      if (!response.ok) throw new Error('Cleanup failed');
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Success', description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/overview'] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Cleanup operation failed', variant: 'destructive' });
    }
  });

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-64 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const data = overview?.overview;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Hunter Brody Admin
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Streamlined management and deployment control
          </p>
        </div>
        <Badge variant={data?.environment === 'production' ? 'default' : 'secondary'}>
          {data?.environment} v{data?.version}
        </Badge>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button
            onClick={() => restartHunters.mutate()}
            disabled={restartHunters.isPending}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${restartHunters.isPending ? 'animate-spin' : ''}`} />
            Restart Hunters
          </Button>
          
          <Button
            onClick={() => cleanup.mutate('failed_hunts')}
            disabled={cleanup.isPending}
            variant="outline"
          >
            <Zap className="h-4 w-4 mr-2" />
            Clean Failed Hunts
          </Button>

          <Button
            onClick={() => cleanup.mutate('old_scans')}
            disabled={cleanup.isPending}
            variant="outline"
          >
            <Database className="h-4 w-4 mr-2" />
            Clean Old Scans
          </Button>
        </CardContent>
      </Card>

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.metrics.totalLeads || 0}</div>
            <p className="text-xs text-muted-foreground">
              Business prospects discovered
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scans Completed</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.metrics.totalScans || 0}</div>
            <p className="text-xs text-muted-foreground">
              Business analysis reports
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue Generated</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${data?.revenue.totalPotential?.toFixed(2) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              Scan fees + tool commissions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hunt Executions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.metrics.huntRuns || 0}</div>
            <p className="text-xs text-muted-foreground">
              Automated discovery runs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
            <CardDescription>Core system status and uptime</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span>Database</span>
              <Badge variant={data?.systemHealth.database === 'connected' ? 'default' : 'destructive'}>
                {data?.systemHealth.database || 'unknown'}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span>Email System</span>
              <Badge variant={data?.systemHealth.emailSystem === 'running' ? 'default' : 'destructive'}>
                {data?.systemHealth.emailSystem || 'unknown'}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span>Hunter Jobs</span>
              <Badge variant="outline">
                {data?.systemHealth.activeJobs || 0} / {data?.systemHealth.hunterJobs || 0} active
              </Badge>
            </div>
            
            <Separator />
            
            <div className="flex items-center justify-between">
              <span>Uptime</span>
              <span className="text-sm text-muted-foreground">
                {data?.uptime ? formatUptime(data.uptime) : '0h 0m'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deployment Status</CardTitle>
            <CardDescription>Production readiness checks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {deployStatus && (
              <>
                <div className="flex items-center justify-between">
                  <span>Database Connection</span>
                  <Badge variant={deployStatus.checks.database ? 'default' : 'destructive'}>
                    {deployStatus.checks.database ? 'Ready' : 'Failed'}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span>Migrations</span>
                  <Badge variant={deployStatus.checks.migrations ? 'default' : 'destructive'}>
                    {deployStatus.checks.migrations ? 'Ready' : 'Failed'}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span>Services</span>
                  <Badge variant={deployStatus.checks.services ? 'default' : 'destructive'}>
                    {deployStatus.checks.services ? 'Ready' : 'Failed'}
                  </Badge>
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <span>Deploy Ready</span>
                  <Badge variant={deployStatus.deployReady ? 'default' : 'destructive'}>
                    {deployStatus.deployReady ? 'Ready' : 'Not Ready'}
                  </Badge>
                </div>
                
                <p className="text-sm text-muted-foreground">
                  {deployStatus.message}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Breakdown</CardTitle>
          <CardDescription>Detailed financial performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                ${data?.revenue.scanRevenue?.toFixed(2) || '0.00'}
              </div>
              <p className="text-sm text-muted-foreground">Scan Revenue</p>
              <p className="text-xs text-muted-foreground">
                {data?.revenue.totalScans || 0} scans × $49.99
              </p>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                ${data?.revenue.estimatedMonthlyCommissions?.toFixed(2) || '0.00'}
              </div>
              <p className="text-sm text-muted-foreground">Monthly Commissions</p>
              <p className="text-xs text-muted-foreground">
                15% commission on tool recommendations
              </p>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                ${data?.revenue.totalPotential?.toFixed(2) || '0.00'}
              </div>
              <p className="text-sm text-muted-foreground">Total Potential</p>
              <p className="text-xs text-muted-foreground">
                Combined revenue per business
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}