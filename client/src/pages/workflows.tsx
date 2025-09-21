import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Search, 
  Plus, 
  Edit, 
  Play, 
  Trash2, 
  Star, 
  StarOff, 
  Eye, 
  Settings, 
  GitBranch, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Circle,
  RotateCcw,
  Filter,
  Download,
  Upload,
  ChevronDown,
  ChevronRight,
  FileText,
  Activity,
  Database,
  Calendar,
  Users,
  Target,
  BarChart3,
  Zap
} from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Workflow, WorkflowVersion, WorkflowRun, WorkflowRunStep } from "@shared/schema";

// Enhanced types for UI components
interface WorkflowWithVersions extends Workflow {
  versionCount: number;
  publishedVersions: number;
  versions?: WorkflowVersion[];
}

interface WorkflowRunWithDetails extends WorkflowRun {
  workflowName?: string;
  workflowVersion?: number;
  steps?: WorkflowRunStep[];
}

// Validation schemas
const workflowFormSchema = z.object({
  name: z.string().min(1, "Workflow name is required"),
  businessType: z.string().optional(),
  isDefault: z.boolean().optional(),
});

const versionFormSchema = z.object({
  definition: z.any(),
  status: z.enum(["draft", "published"]).optional(),
});

const businessTypes = [
  "general",
  "restaurant", 
  "retail",
  "technology",
  "healthcare",
  "finance",
  "real-estate",
  "education",
  "consulting",
  "ecommerce",
  "manufacturing",
  "non-profit"
];

// Status Badge Component
const getStatusBadge = (status: string) => {
  const variants = {
    draft: "secondary",
    published: "default",
    queued: "secondary", 
    running: "default",
    succeeded: "default",
    failed: "destructive",
  } as const;
  
  const colors = {
    draft: "text-yellow-600",
    published: "text-green-600", 
    queued: "text-blue-600",
    running: "text-blue-600",
    succeeded: "text-green-600",
    failed: "text-red-600",
  } as const;

  return (
    <Badge variant={variants[status as keyof typeof variants] || "secondary"} 
           className={colors[status as keyof typeof colors]}>
      {status}
    </Badge>
  );
};

export default function WorkflowsPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  
  // State management
  const [searchTerm, setSearchTerm] = useState("");
  const [businessTypeFilter, setBusinessTypeFilter] = useState<string>("all");
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowWithVersions | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<WorkflowVersion | null>(null);
  const [selectedRun, setSelectedRun] = useState<WorkflowRunWithDetails | null>(null);
  const [activeTab, setActiveTab] = useState("list");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showVersionDialog, setShowVersionDialog] = useState(false);
  const [showRunsDialog, setShowRunsDialog] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());

  // API queries
  const { data: workflows = [], isLoading: workflowsLoading, refetch: refetchWorkflows } = useQuery({
    queryKey: ["/api/workflows"],
  }) as { data: WorkflowWithVersions[]; isLoading: boolean; refetch: () => void };

  const { data: workflowRunsData = [], isLoading: runsLoading } = useQuery({
    queryKey: ["/api/workflow-runs"],
    enabled: showRunsDialog && !!selectedWorkflow,
  }) as { data: WorkflowRunWithDetails[]; isLoading: boolean };

  // Mutations
  const createWorkflowMutation = useMutation({
    mutationFn: (data: z.infer<typeof workflowFormSchema>) => 
      apiRequest("POST", "/api/workflows", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      setShowCreateDialog(false);
      toast({
        title: "Success",
        description: "Workflow created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create workflow",
        variant: "destructive",
      });
    },
  });

  const updateWorkflowMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Workflow> }) =>
      apiRequest("PATCH", `/api/workflows/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({
        title: "Success",
        description: "Workflow updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update workflow",
        variant: "destructive",
      });
    },
  });

  const deleteWorkflowMutation = useMutation({
    mutationFn: (id: string) => 
      apiRequest("DELETE", `/api/workflows/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({
        title: "Success", 
        description: "Workflow deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete workflow",
        variant: "destructive",
      });
    },
  });

  const makeDefaultMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/workflows/${id}/make-default`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({
        title: "Success",
        description: "Workflow set as default successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set workflow as default",
        variant: "destructive",
      });
    },
  });

  const createVersionMutation = useMutation({
    mutationFn: ({ workflowId, data }: { workflowId: string; data: any }) =>
      apiRequest("POST", `/api/workflows/${workflowId}/versions`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      setShowVersionDialog(false);
      toast({
        title: "Success",
        description: "Workflow version created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create version",
        variant: "destructive",
      });
    },
  });

  const updateVersionMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/workflow-versions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({
        title: "Success",
        description: "Version updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update version",
        variant: "destructive",
      });
    },
  });

  const publishVersionMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/workflow-versions/${id}/publish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({
        title: "Success",
        description: "Version published successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to publish version",
        variant: "destructive",
      });
    },
  });

  // Filter workflows based on search and business type
  const filteredWorkflows = workflows.filter((workflow: WorkflowWithVersions) => {
    const matchesSearch = workflow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (workflow.businessType || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBusinessType = businessTypeFilter === "all" || workflow.businessType === businessTypeFilter;
    return matchesSearch && matchesBusinessType;
  });

  // Status badge function moved to module level - see above

  const toggleRunExpansion = (runId: string) => {
    const newExpanded = new Set(expandedRuns);
    if (newExpanded.has(runId)) {
      newExpanded.delete(runId);
    } else {
      newExpanded.add(runId);
    }
    setExpandedRuns(newExpanded);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <Settings className="text-primary" />
                Workflow Administration
              </h1>
              <p className="text-muted-foreground mt-2">
                Manage business workflows, versions, and executions
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                onClick={() => refetchWorkflows()}
                data-testid="button-refresh-workflows"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              <Button 
                onClick={() => setShowCreateDialog(true)}
                data-testid="button-create-workflow"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Workflow
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="list" className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Workflows
            </TabsTrigger>
            <TabsTrigger value="versions" className="flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Versions
            </TabsTrigger>
            <TabsTrigger value="runs" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Runs
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* Workflows List Tab */}
          <TabsContent value="list" className="space-y-6">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="w-5 h-5" />
                  Filters & Search
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 items-center">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                      <Input
                        placeholder="Search workflows by name or business type..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                        data-testid="input-search-workflows"
                      />
                    </div>
                  </div>
                  <Select value={businessTypeFilter} onValueChange={setBusinessTypeFilter}>
                    <SelectTrigger className="w-48" data-testid="select-business-type-filter">
                      <SelectValue placeholder="All Business Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Business Types</SelectItem>
                      {businessTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(searchTerm || businessTypeFilter !== "all") && (
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSearchTerm("");
                        setBusinessTypeFilter("all");
                      }}
                      data-testid="button-clear-filters"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Workflows Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Database className="w-5 h-5" />
                    Workflows ({filteredWorkflows.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                    <Button variant="outline" size="sm">
                      <Upload className="w-4 h-4 mr-2" />
                      Import
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {workflowsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <Activity className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
                      <p className="text-muted-foreground">Loading workflows...</p>
                    </div>
                  </div>
                ) : filteredWorkflows.length === 0 ? (
                  <div className="text-center py-12">
                    <Database className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">No workflows found</h3>
                    <p className="text-muted-foreground mb-4">
                      {searchTerm || businessTypeFilter !== "all" ? 
                        "No workflows match your current filters." :
                        "Get started by creating your first workflow."
                      }
                    </p>
                    <Button onClick={() => setShowCreateDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Workflow
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Business Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Versions</TableHead>
                        <TableHead>Last Modified</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWorkflows.map((workflow: WorkflowWithVersions) => (
                        <TableRow key={workflow.id} data-testid={`row-workflow-${workflow.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {workflow.isDefault && (
                                <Star className="w-4 h-4 text-yellow-500 fill-current" />
                              )}
                              <div>
                                <div className="font-medium">{workflow.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  ID: {workflow.id}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {workflow.businessType || "General"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {workflow.isDefault && (
                                <Badge variant="default" className="text-yellow-600">
                                  Default
                                </Badge>
                              )}
                              <Badge variant="secondary">
                                {workflow.publishedVersions > 0 ? "Active" : "Draft"}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <GitBranch className="w-4 h-4 text-muted-foreground" />
                              <span>{workflow.versionCount}</span>
                              <span className="text-muted-foreground">
                                ({workflow.publishedVersions} published)
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-muted-foreground" />
                              {workflow.createdAt ? 
                                format(new Date(workflow.createdAt), "MMM d, yyyy") : 
                                "Unknown"
                              }
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedWorkflow(workflow);
                                  setActiveTab("versions");
                                }}
                                data-testid={`button-edit-workflow-${workflow.id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedWorkflow(workflow);
                                  setShowRunsDialog(true);
                                }}
                                data-testid={`button-view-runs-${workflow.id}`}
                              >
                                <Activity className="w-4 h-4" />
                              </Button>
                              {!workflow.isDefault && workflow.businessType && workflow.publishedVersions > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => makeDefaultMutation.mutate(workflow.id)}
                                  disabled={makeDefaultMutation.isPending}
                                  data-testid={`button-make-default-${workflow.id}`}
                                >
                                  <Star className="w-4 h-4" />
                                </Button>
                              )}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    data-testid={`button-delete-workflow-${workflow.id}`}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Workflow</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete "{workflow.name}"? This action cannot be undone and will remove all versions and associated data.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteWorkflowMutation.mutate(workflow.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Versions Tab */}
          <TabsContent value="versions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitBranch className="w-5 h-5" />
                  Version Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedWorkflow ? (
                  <VersionManager 
                    workflow={selectedWorkflow}
                    onVersionSelect={setSelectedVersion}
                    onCreateVersion={() => setShowVersionDialog(true)}
                    onUpdateVersion={(id, data) => updateVersionMutation.mutate({ id, data })}
                    onPublishVersion={(id) => publishVersionMutation.mutate(id)}
                  />
                ) : (
                  <div className="text-center py-12">
                    <GitBranch className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">Select a workflow</h3>
                    <p className="text-muted-foreground">
                      Choose a workflow from the list to manage its versions.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Runs Tab */}
          <TabsContent value="runs" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Workflow Runs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <WorkflowRunsTable 
                  runs={workflowRunsData as WorkflowRunWithDetails[]}
                  loading={runsLoading}
                  expandedRuns={expandedRuns}
                  onToggleExpansion={toggleRunExpansion}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Workflow Analytics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <BarChart3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Analytics Dashboard</h3>
                  <p className="text-muted-foreground">
                    Workflow performance metrics and insights coming soon.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Workflow Dialog */}
      <CreateWorkflowDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={(data) => createWorkflowMutation.mutate(data)}
        isLoading={createWorkflowMutation.isPending}
      />

      {/* Create Version Dialog */}
      <CreateVersionDialog
        open={showVersionDialog}
        onOpenChange={setShowVersionDialog}
        workflow={selectedWorkflow}
        onSubmit={(data) => {
          if (selectedWorkflow) {
            createVersionMutation.mutate({ workflowId: selectedWorkflow.id, data });
          }
        }}
        isLoading={createVersionMutation.isPending}
      />

      {/* Workflow Runs Dialog */}
      <Dialog open={showRunsDialog} onOpenChange={setShowRunsDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Workflow Runs - {selectedWorkflow?.name}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <WorkflowRunsTable 
              runs={(workflowRunsData as WorkflowRunWithDetails[]).filter((run: WorkflowRunWithDetails) => 
                selectedWorkflow && run.workflowName === selectedWorkflow.name
              )}
              loading={runsLoading}
              expandedRuns={expandedRuns}
              onToggleExpansion={toggleRunExpansion}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Create Workflow Dialog Component
function CreateWorkflowDialog({ 
  open, 
  onOpenChange, 
  onSubmit, 
  isLoading 
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: z.infer<typeof workflowFormSchema>) => void;
  isLoading: boolean;
}) {
  const form = useForm<z.infer<typeof workflowFormSchema>>({
    resolver: zodResolver(workflowFormSchema),
    defaultValues: {
      name: "",
      businessType: "",
      isDefault: false,
    },
  });

  const handleSubmit = (data: z.infer<typeof workflowFormSchema>) => {
    onSubmit(data);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Create New Workflow
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Workflow Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Enter workflow name..."
                      {...field}
                      data-testid="input-workflow-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="businessType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-workflow-business-type">
                        <SelectValue placeholder="Select business type..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {businessTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isDefault"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>Default Workflow</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      Set as default workflow for this business type
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-is-default"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-create"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading}
                data-testid="button-submit-create"
              >
                {isLoading ? (
                  <>
                    <Activity className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Workflow
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Create Version Dialog Component
function CreateVersionDialog({ 
  open, 
  onOpenChange, 
  workflow,
  onSubmit, 
  isLoading 
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: WorkflowWithVersions | null;
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [definition, setDefinition] = useState('{\n  "steps": [\n    {\n      "id": "step1",\n      "type": "email",\n      "config": {\n        "template": "welcome",\n        "delay": 0\n      }\n    }\n  ]\n}');

  const handleSubmit = () => {
    try {
      const parsedDefinition = JSON.parse(definition);
      onSubmit({ definition: parsedDefinition });
      setDefinition('{\n  "steps": [\n    {\n      "id": "step1",\n      "type": "email",\n      "config": {\n        "template": "welcome",\n        "delay": 0\n      }\n    }\n  ]\n}');
    } catch (error) {
      // Handle JSON parsing error
      console.error("Invalid JSON:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Create New Version - {workflow?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Workflow Definition (JSON)</label>
            <Textarea
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              placeholder="Enter workflow definition..."
              className="min-h-[300px] font-mono text-sm"
              data-testid="textarea-workflow-definition"
            />
          </div>
          
          <div className="flex justify-end gap-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-version"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={isLoading}
              data-testid="button-submit-version"
            >
              {isLoading ? (
                <>
                  <Activity className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <GitBranch className="w-4 h-4 mr-2" />
                  Create Version
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Version Manager Component
function VersionManager({ 
  workflow,
  onVersionSelect,
  onCreateVersion,
  onUpdateVersion,
  onPublishVersion
}: {
  workflow: WorkflowWithVersions;
  onVersionSelect: (version: WorkflowVersion) => void;
  onCreateVersion: () => void;
  onUpdateVersion: (id: string, data: any) => void;
  onPublishVersion: (id: string) => void;
}) {
  const { data: workflowDetails } = useQuery({
    queryKey: ["/api/workflows", workflow.id],
    enabled: !!workflow.id,
  });

  const versions = (workflowDetails as any)?.versions || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{workflow.name}</h3>
          <p className="text-muted-foreground">Manage workflow versions and definitions</p>
        </div>
        <Button onClick={onCreateVersion} data-testid="button-create-version">
          <Plus className="w-4 h-4 mr-2" />
          Create Version
        </Button>
      </div>

      {versions.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
          <GitBranch className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No versions yet</h3>
          <p className="text-muted-foreground mb-4">
            Create the first version of this workflow to get started.
          </p>
          <Button onClick={onCreateVersion}>
            <Plus className="w-4 h-4 mr-2" />
            Create First Version
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {versions.map((version: WorkflowVersion) => (
            <Card key={version.id} className="relative">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant={version.status === "published" ? "default" : "secondary"}>
                      Version {version.version}
                    </Badge>
                    {getStatusBadge(version.status)}
                    {workflow.activeVersionId === version.id && (
                      <Badge variant="outline" className="text-green-600">
                        Active
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onVersionSelect(version)}
                      data-testid={`button-edit-version-${version.id}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    {version.status === "draft" && (
                      <Button
                        variant="outline" 
                        size="sm"
                        onClick={() => onPublishVersion(version.id)}
                        data-testid={`button-publish-version-${version.id}`}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Publish
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    Created: {format(new Date(version.createdAt!), "MMM d, yyyy 'at' h:mm a")}
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-2">Definition Preview</label>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                      {JSON.stringify(version.definition, null, 2)}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Workflow Runs Table Component
function WorkflowRunsTable({ 
  runs, 
  loading, 
  expandedRuns, 
  onToggleExpansion 
}: {
  runs: WorkflowRunWithDetails[];
  loading: boolean;
  expandedRuns: Set<string>;
  onToggleExpansion: (runId: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Activity className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading workflow runs...</p>
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-12">
        <Activity className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">No workflow runs</h3>
        <p className="text-muted-foreground">
          Workflow runs will appear here when workflows are executed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {runs.map((run: WorkflowRunWithDetails) => (
        <Card key={run.id} className="relative">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onToggleExpansion(run.id)}
                  data-testid={`button-toggle-run-${run.id}`}
                >
                  {expandedRuns.has(run.id) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </Button>
                <div>
                  <div className="font-medium">
                    {run.workflowName} v{run.workflowVersion}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ID: {run.id}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {getStatusBadge(run.status)}
                <div className="text-sm text-muted-foreground">
                  {run.createdAt && format(new Date(run.createdAt), "MMM d, h:mm a")}
                </div>
              </div>
            </div>
          </CardHeader>
          
          <Collapsible open={expandedRuns.has(run.id)}>
            <CollapsibleContent>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-1">Started</label>
                      <p className="text-sm text-muted-foreground">
                        {run.startedAt ? format(new Date(run.startedAt), "MMM d, yyyy 'at' h:mm a") : "Not started"}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1">Finished</label>
                      <p className="text-sm text-muted-foreground">
                        {run.finishedAt ? format(new Date(run.finishedAt), "MMM d, yyyy 'at' h:mm a") : "Not finished"}
                      </p>
                    </div>
                  </div>
                  
                  {run.context && (
                    <div>
                      <label className="text-sm font-medium block mb-2">Context</label>
                      <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                        {run.context && typeof run.context === 'object' 
                          ? JSON.stringify(run.context, null, 2) 
                          : String(run.context || '')}
                      </pre>
                    </div>
                  )}
                  
                  {run.steps && run.steps.length > 0 && (
                    <div>
                      <label className="text-sm font-medium block mb-2">Steps</label>
                      <div className="space-y-2">
                        {run.steps.map((step: WorkflowRunStep) => (
                          <div key={step.id} className="border rounded p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{step.stepKey}</span>
                                <Badge variant="outline">{step.type}</Badge>
                              </div>
                              {getStatusBadge(step.status)}
                            </div>
                            {step.error && (
                              <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                                {step.error}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      ))}
    </div>
  );
}