import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { 
  Satellite, 
  ArrowLeft, 
  Lock, 
  CheckCircle, 
  ExternalLink, 
  CreditCard,
  AlertCircle,
  Loader2,
  Database,
  TrendingUp,
  Users,
  Globe,
  Star
} from "lucide-react";
import { format } from "date-fns";

type ScanResult = {
  id: string;
  businessName: string;
  website?: string;
  email?: string;
  status: string;
  scanData?: string;
  createdAt: string;
};

type PaymentConfig = {
  paymentsEnabled: boolean;
  publishableKeyPresent: boolean;
  publicKey?: string;
  paymentLinkUrl?: string;
  currency?: string;
  defaultAmount?: number;
};

type PaymentStatus = {
  hasAccess: boolean;
  payment: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    createdAt: string;
  } | null;
  lead: {
    id: string;
    status: string;
    businessName: string;
  };
};

export default function ScanDetail() {
  const { scanId } = useParams();
  const { toast } = useToast();

  // Get scan result details
  const {
    data: scanResult,
    isLoading: scanLoading,
    error: scanError,
  } = useQuery<ScanResult>({
    queryKey: ["/api/results", scanId],
    queryFn: () => apiRequest(`/api/results/${scanId}`),
  });

  // Get payment configuration
  const {
    data: paymentConfig,
    isLoading: configLoading
  } = useQuery<PaymentConfig>({
    queryKey: ["/api/payments/config"],
  });

  // Get payment status for this scan (using leadId)
  const {
    data: paymentStatus,
    isLoading: statusLoading,
    refetch: refetchStatus
  } = useQuery<PaymentStatus>({
    queryKey: ["/api/payments/status", scanId],
    queryFn: () => apiRequest(`/api/payments/status/${scanId}`),
    enabled: !!scanId,
  });

  // Create checkout session mutation
  const checkoutMutation = useMutation({
    mutationFn: async (scanId: string) => {
      const response = await apiRequest("/api/payments/checkout", {
        method: "POST",
        body: JSON.stringify({ scanId }),
      });
      return response;
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        // Redirect to Stripe Checkout
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Payment Failed",
        description: error.message || "Failed to initiate payment. Please try again.",
      });
    },
  });

  const handleBuyFullScan = () => {
    if (!scanId) return;
    checkoutMutation.mutate(scanId);
  };

  const parseInsights = (scanData?: string) => {
    try {
      const data = scanData ? JSON.parse(scanData) : {};
      return data.insights || [];
    } catch {
      return [];
    }
  };

  const getBusinessScore = (scanData?: string) => {
    try {
      const data = scanData ? JSON.parse(scanData) : {};
      return data.businessScore || 0;
    } catch {
      return 0;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return <Badge className="bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400">Completed</Badge>;
      case "scanning":
        return <Badge className="bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400">Scanning</Badge>;
      case "converted":
        return <Badge className="bg-purple-500/10 text-purple-700 border-purple-500/20 dark:text-purple-400">Premium Access</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (scanLoading || configLoading || statusLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <nav className="bg-card border-b border-border sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <Skeleton className="w-8 h-8 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (scanError || !scanResult) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <nav className="bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Satellite className="text-primary-foreground w-4 h-4" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">Alien Probe</h1>
                  <p className="text-xs text-muted-foreground">Scan Details</p>
                </div>
              </div>
              <Link href="/results">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Results
                </Button>
              </Link>
            </div>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Card className="bg-destructive/10 border-destructive/20">
            <CardContent className="p-6 text-center">
              <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-destructive mb-2">Scan Not Found</h3>
              <p className="text-destructive/80 mb-4">
                The requested scan result could not be found. It may have been deleted or the ID is invalid.
              </p>
              <Link href="/results">
                <Button variant="outline">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Results
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const insights = parseInsights(scanResult.scanData);
  const businessScore = getBusinessScore(scanResult.scanData);
  const hasAccess = paymentStatus?.hasAccess || false;
  const paymentsEnabled = paymentConfig?.paymentsEnabled || false;
  const showPaymentButton = paymentsEnabled && !hasAccess && scanResult.status === "completed";

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
                  <h1 className="text-xl font-bold text-foreground">Alien Probe</h1>
                  <p className="text-xs text-muted-foreground">Scan Details</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/results">
                <Button variant="outline" size="sm" data-testid="button-back-results">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Results
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                {scanResult.businessName}
              </h1>
              <p className="text-muted-foreground">
                Scanned on {format(new Date(scanResult.createdAt), "MMMM dd, yyyy 'at' HH:mm")}
              </p>
            </div>
            <div className="text-right">
              {getStatusBadge(paymentStatus?.lead.status || scanResult.status)}
            </div>
          </div>
          
          {scanResult.website && (
            <div className="flex items-center text-sm text-muted-foreground">
              <Globe className="w-4 h-4 mr-2" />
              <a
                href={scanResult.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 flex items-center"
                data-testid="link-business-website"
              >
                {scanResult.website}
                <ExternalLink className="w-3 h-3 ml-1" />
              </a>
            </div>
          )}
        </div>

        {/* Basic Scan Information (Free) */}
        <Card className="mb-6" data-testid="card-basic-info">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Database className="text-primary mr-3" />
              Basic Scan Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {businessScore > 0 && (
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center">
                  <TrendingUp className="text-primary w-5 h-5 mr-3" />
                  <span className="font-medium">Business Score</span>
                </div>
                <div className="flex items-center">
                  <span className="text-2xl font-bold text-primary mr-2">{businessScore}</span>
                  <span className="text-sm text-muted-foreground">/ 100</span>
                </div>
              </div>
            )}

            {insights.length > 0 && (
              <div>
                <h4 className="font-medium mb-3 flex items-center">
                  <Star className="text-primary w-4 h-4 mr-2" />
                  Initial Insights
                </h4>
                <div className="space-y-2">
                  {insights.slice(0, 2).map((insight: string, index: number) => (
                    <div
                      key={index}
                      className="text-sm text-muted-foreground bg-muted/30 rounded px-3 py-2"
                      data-testid={`insight-basic-${index}`}
                    >
                      {insight}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {scanResult.status !== "completed" && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This scan is still in progress. Complete results will be available once scanning finishes.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Payment Gate for Detailed Information */}
        {scanResult.status === "completed" && (
          <>
            {!hasAccess ? (
              <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background" data-testid="card-payment-gate">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Lock className="text-primary mr-3" />
                    Unlock Full Business Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="text-center py-6">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CreditCard className="text-primary w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Get the Complete Picture</h3>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                      Unlock detailed business insights, competitive analysis, growth opportunities, and actionable recommendations.
                    </p>
                    
                    <div className="bg-muted/30 rounded-lg p-4 mb-6">
                      <h4 className="font-medium mb-3">Full Report Includes:</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-muted-foreground">
                        <div className="flex items-center">
                          <CheckCircle className="text-green-500 w-4 h-4 mr-2" />
                          Detailed competitive analysis
                        </div>
                        <div className="flex items-center">
                          <CheckCircle className="text-green-500 w-4 h-4 mr-2" />
                          Growth opportunity assessment
                        </div>
                        <div className="flex items-center">
                          <CheckCircle className="text-green-500 w-4 h-4 mr-2" />
                          Market positioning insights
                        </div>
                        <div className="flex items-center">
                          <CheckCircle className="text-green-500 w-4 h-4 mr-2" />
                          Actionable recommendations
                        </div>
                        <div className="flex items-center">
                          <CheckCircle className="text-green-500 w-4 h-4 mr-2" />
                          Risk assessment & mitigation
                        </div>
                        <div className="flex items-center">
                          <CheckCircle className="text-green-500 w-4 h-4 mr-2" />
                          Strategic planning guidance
                        </div>
                      </div>
                    </div>

                    {showPaymentButton ? (
                      <Button
                        onClick={handleBuyFullScan}
                        disabled={checkoutMutation.isPending}
                        size="lg"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
                        data-testid="button-buy-full-scan"
                      >
                        {checkoutMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <CreditCard className="w-4 h-4 mr-2" />
                            Buy Full Scan Report - ${(paymentConfig?.defaultAmount || 4900) / 100}
                          </>
                        )}
                      </Button>
                    ) : paymentConfig?.paymentLinkUrl ? (
                      <Button
                        onClick={() => window.open(paymentConfig.paymentLinkUrl, '_blank')}
                        size="lg"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
                        data-testid="button-buy-full-scan-link"
                      >
                        <CreditCard className="w-4 h-4 mr-2" />
                        Buy Full Scan Report - ${(paymentConfig?.defaultAmount || 4900) / 100}
                      </Button>
                    ) : !paymentsEnabled ? (
                      <Alert className="max-w-md mx-auto">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Payments are currently disabled. Contact support for access to full reports.
                        </AlertDescription>
                      </Alert>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-green-500/20 bg-gradient-to-br from-green-500/5 to-background" data-testid="card-full-analysis">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <CheckCircle className="text-green-500 mr-3" />
                    Full Business Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {paymentStatus?.payment && (
                    <Alert className="border-green-500/20 bg-green-500/10">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <AlertDescription className="text-green-700 dark:text-green-400">
                        Payment completed on {format(new Date(paymentStatus.payment.createdAt), "MMMM dd, yyyy")}. 
                        You now have full access to this business analysis.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="bg-muted/30">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center">
                          <TrendingUp className="text-primary w-5 h-5 mr-2" />
                          Growth Opportunities
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3 text-sm">
                          <div className="p-3 bg-background rounded border">
                            Expand digital marketing presence to increase online visibility by an estimated 35%
                          </div>
                          <div className="p-3 bg-background rounded border">
                            Implement customer retention program to boost repeat business by 25%
                          </div>
                          <div className="p-3 bg-background rounded border">
                            Optimize pricing strategy to improve profit margins by 15-20%
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-muted/30">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center">
                          <Users className="text-primary w-5 h-5 mr-2" />
                          Competitive Analysis
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3 text-sm">
                          <div className="p-3 bg-background rounded border">
                            <strong>Market Position:</strong> Strong local presence, opportunity to expand regionally
                          </div>
                          <div className="p-3 bg-background rounded border">
                            <strong>Competitive Advantage:</strong> Superior customer service and personalized approach
                          </div>
                          <div className="p-3 bg-background rounded border">
                            <strong>Threats:</strong> New entrants with lower pricing, technology disruption risk
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-semibold mb-3 flex items-center">
                      <Star className="text-primary w-5 h-5 mr-2" />
                      Complete Insights & Recommendations
                    </h4>
                    <div className="grid gap-3">
                      {insights.map((insight: string, index: number) => (
                        <div
                          key={index}
                          className="text-sm bg-muted/30 rounded-lg p-4 border"
                          data-testid={`insight-full-${index}`}
                        >
                          <div className="flex items-start">
                            <div className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0" />
                            <span>{insight}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Alert className="border-primary/20 bg-primary/5">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    <AlertDescription>
                      This detailed analysis is now permanently unlocked for this business scan.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}