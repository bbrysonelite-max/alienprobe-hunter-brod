import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ActivityFeed } from '@/components/ActivityFeed';
import { 
  Activity, 
  Database, 
  DollarSign, 
  Play, 
  RefreshCw, 
  Settings, 
  TrendingUp,
  Users,
  Zap,
  Target,
  Edit,
  Mail,
  Sliders,
  BarChart
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

interface SystemGoal {
  id: string;
  goalType: string;
  targetValue: number;
  currentValue: number;
  resetDate: string;
  isActive: boolean;
}

export default function AdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingGoal, setEditingGoal] = useState(false);
  const [newTarget, setNewTarget] = useState(5);

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

  // Goals query
  const { data: goalsData } = useQuery<{ success: boolean; goals: SystemGoal[] }>({
    queryKey: ['/api/admin/goals'],
    refetchInterval: 30000 // Refresh every 30 seconds
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

  // Set goal mutation
  const setGoal = useMutation({
    mutationFn: async (data: { goalType: string; targetValue: number }) => {
      const response = await fetch('/api/admin/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to set goal');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Daily goal updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/goals'] });
      setEditingGoal(false);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update daily goal', variant: 'destructive' });
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
  const goals = goalsData?.goals || [];
  const dailyGoal = goals.find(g => g.goalType === 'daily_scans');

  const handleSaveGoal = () => {
    setGoal.mutate({ goalType: 'daily_scans', targetValue: newTarget });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white font-['Orbitron']">
            Hunter Brody Mission Control
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Autonomous Business Optimization Platform
          </p>
        </div>
        <Badge variant={data?.environment === 'production' ? 'default' : 'secondary'}>
          {data?.environment} v{data?.version}
        </Badge>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="dashboard" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto">
          <TabsTrigger value="dashboard" className="gap-2" data-testid="tab-dashboard">
            <BarChart className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="pricing" className="gap-2" data-testid="tab-pricing">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Pricing</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2" data-testid="tab-settings">
            <Sliders className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2" data-testid="tab-activity">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Activity</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2" data-testid="tab-email">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Email</span>
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
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

      {/* Daily Goals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Daily Goals
          </CardTitle>
          <CardDescription>Set and track your daily business scanning targets</CardDescription>
        </CardHeader>
        <CardContent>
          {dailyGoal ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="font-medium">Daily Scans Target</p>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">{dailyGoal.currentValue}</span>
                    <span className="text-muted-foreground">/ {dailyGoal.targetValue}</span>
                  </div>
                  <div className="w-64 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ 
                        width: `${Math.min((dailyGoal.currentValue / dailyGoal.targetValue) * 100, 100)}%` 
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {Math.round((dailyGoal.currentValue / dailyGoal.targetValue) * 100)}% of daily target
                  </p>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewTarget(dailyGoal.targetValue);
                    setEditingGoal(true);
                  }}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Target
                </Button>
              </div>
              
              {editingGoal && (
                <div className="border-t pt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="target">New Daily Target</Label>
                    <Input
                      id="target"
                      type="number"
                      min="1"
                      value={newTarget}
                      onChange={(e) => setNewTarget(parseInt(e.target.value) || 1)}
                      className="w-32"
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveGoal}
                      disabled={setGoal.isPending}
                    >
                      Save Target
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingGoal(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6">
              <Target className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground mb-4">No daily goal set</p>
              <Button
                onClick={() => {
                  setNewTarget(5);
                  setEditingGoal(true);
                }}
              >
                Set Daily Target
              </Button>
              
              {editingGoal && (
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="target">Daily Scans Target</Label>
                    <Input
                      id="target"
                      type="number"
                      min="1"
                      value={newTarget}
                      onChange={(e) => setNewTarget(parseInt(e.target.value) || 1)}
                      className="w-32 mx-auto"
                    />
                  </div>
                  
                  <div className="flex gap-2 justify-center">
                    <Button
                      size="sm"
                      onClick={handleSaveGoal}
                      disabled={setGoal.isPending}
                    >
                      Set Target
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingGoal(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
        </TabsContent>

        {/* Pricing Tab */}
        <TabsContent value="pricing" className="space-y-6">
          <PricingManagement />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <SystemSettings />
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          <ActivityFeed maxHeight="800px" />
        </TabsContent>

        {/* Email Tab */}
        <TabsContent value="email" className="space-y-6">
          <EmailAutomation />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Pricing Management Component
function PricingManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState(4999);

  const { data: pricingData, isLoading } = useQuery<{ success: boolean; plans: any[] }>({
    queryKey: ['/api/admin/pricing']
  });

  const updatePrice = useMutation({
    mutationFn: async ({ id, scanPrice }: { id: string; scanPrice: number }) => {
      const res = await apiRequest('PATCH', `/api/admin/pricing/${id}`, { scanPrice });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Pricing updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/pricing'] });
      setEditingPlan(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update pricing', variant: 'destructive' });
    }
  });

  if (isLoading) {
    return <div className="animate-pulse">Loading pricing...</div>;
  }

  const plans = pricingData?.plans || [];

  return (
    <Card className="bg-slate-900/60 backdrop-blur-xl border-cyan-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-['Orbitron']">
          <DollarSign className="h-5 w-5 text-cyan-400" />
          Pricing Management
        </CardTitle>
        <CardDescription>Configure scan pricing and subscription plans</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {plans.map((plan) => (
            <div key={plan.id} className="flex items-center justify-between p-4 bg-slate-800/40 rounded-lg border border-cyan-500/10 hover:border-cyan-500/30 transition-all" data-testid={`pricing-plan-${plan.id}`}>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                  {plan.isDefault && (
                    <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">Default</Badge>
                  )}
                  {!plan.active && (
                    <Badge variant="destructive">Inactive</Badge>
                  )}
                </div>
                <p className="text-sm text-slate-400 mt-1">{plan.description || 'No description'}</p>
              </div>
              
              {editingPlan === plan.id ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-400">$</span>
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      value={newPrice}
                      onChange={(e) => setNewPrice(parseInt(e.target.value) || 0)}
                      className="w-24 text-right font-mono"
                      data-testid={`input-price-${plan.id}`}
                    />
                    <span className="text-sm text-slate-400">/scan</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => updatePrice.mutate({ id: plan.id, scanPrice: newPrice })}
                    disabled={updatePrice.isPending}
                    data-testid={`button-save-price-${plan.id}`}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingPlan(null)}
                    data-testid={`button-cancel-price-${plan.id}`}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white font-mono">
                      ${(plan.scanPrice / 100).toFixed(2)}
                    </div>
                    <div className="text-xs text-slate-400">per scan</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingPlan(plan.id);
                      setNewPrice(plan.scanPrice);
                    }}
                    data-testid={`button-edit-price-${plan.id}`}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                </div>
              )}
            </div>
          ))}
          
          {plans.length === 0 && (
            <div className="text-center py-12">
              <DollarSign className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No pricing plans configured</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// System Settings Component
function SystemSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settingsData, isLoading } = useQuery<{ success: boolean; settings: any[] }>({
    queryKey: ['/api/admin/settings']
  });

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: any }) => {
      const res = await apiRequest('PATCH', `/api/admin/settings/${key}`, { value });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Setting updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update setting', variant: 'destructive' });
    }
  });

  if (isLoading) {
    return <div className="animate-pulse">Loading settings...</div>;
  }

  const settings = settingsData?.settings || [];

  return (
    <Card className="bg-slate-900/60 backdrop-blur-xl border-cyan-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-['Orbitron']">
          <Sliders className="h-5 w-5 text-cyan-400" />
          System Settings
        </CardTitle>
        <CardDescription>Configure platform-wide settings and automation</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {settings.length > 0 ? (
            settings.map((setting) => (
              <div key={setting.id} className="flex items-center justify-between p-4 bg-slate-800/40 rounded-lg border border-cyan-500/10" data-testid={`setting-${setting.key}`}>
                <div className="flex-1">
                  <h4 className="font-medium text-white font-mono">{setting.key}</h4>
                  <p className="text-sm text-slate-400 mt-1">{setting.description || 'No description'}</p>
                  <Badge variant="outline" className="mt-2 text-xs">{setting.category}</Badge>
                </div>
                <div className="text-right">
                  <code className="text-sm bg-slate-700/50 px-3 py-1 rounded text-cyan-400 font-mono">
                    {JSON.stringify(setting.value)}
                  </code>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <Settings className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No settings configured</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Email Automation Component
function EmailAutomation() {
  const { toast } = useToast();
  const [scanId, setScanId] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');

  const sendEmail = useMutation({
    mutationFn: async ({ scanId, recipientEmail }: { scanId: string; recipientEmail: string }) => {
      const res = await apiRequest('POST', '/api/admin/email-reports/send', { scanId, recipientEmail });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Email sent successfully' });
      setScanId('');
      setRecipientEmail('');
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to send email', variant: 'destructive' });
    }
  });

  return (
    <Card className="bg-slate-900/60 backdrop-blur-xl border-cyan-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-['Orbitron']">
          <Mail className="h-5 w-5 text-cyan-400" />
          Email Automation
        </CardTitle>
        <CardDescription>Send automated scan reports and follow-ups via SendGrid</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="bg-slate-800/40 p-6 rounded-lg border border-cyan-500/10">
            <h3 className="text-lg font-semibold text-white mb-4">Send Scan Report</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="scanId" className="text-slate-300">Scan ID</Label>
                <Input
                  id="scanId"
                  value={scanId}
                  onChange={(e) => setScanId(e.target.value)}
                  placeholder="Enter scan ID"
                  className="bg-slate-700/50 border-slate-600 text-white font-mono"
                  data-testid="input-scan-id"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">Recipient Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  className="bg-slate-700/50 border-slate-600 text-white"
                  data-testid="input-recipient-email"
                />
              </div>
              <Button
                onClick={() => sendEmail.mutate({ scanId, recipientEmail })}
                disabled={!scanId || !recipientEmail || sendEmail.isPending}
                className="w-full bg-cyan-500 hover:bg-cyan-600 text-white"
                data-testid="button-send-email"
              >
                {sendEmail.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    Send Email Report
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-cyan-400 mt-0.5" />
              <div>
                <h4 className="font-semibold text-cyan-300 mb-1">Automated Email System Active</h4>
                <p className="text-sm text-slate-300">
                  Scan reports are automatically sent via SendGrid when scans complete. 
                  Use this form to manually send reports for specific scans.
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}