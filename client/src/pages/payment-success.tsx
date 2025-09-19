import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CheckCircle, 
  ArrowRight, 
  Download, 
  Mail, 
  Satellite,
  Database,
  Home,
  XCircle,
  Clock
} from "lucide-react";

export default function PaymentSuccess() {
  const [location] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    const id = params.get('session_id');
    setSessionId(id);
  }, [location]);

  // Cache invalidation effect when payment is successful
  useEffect(() => {
    if (isSuccessful && confirmation?.session?.metadata?.scanId) {
      const scanId = confirmation.session.metadata.scanId;
      
      // Invalidate payment status and scan result caches using scanId
      // This matches the query keys used throughout the app
      queryClient.invalidateQueries({ 
        queryKey: ["/api/payments/status", scanId]
      });
      
      queryClient.invalidateQueries({ 
        queryKey: ["/api/results", scanId] 
      });
      
      // Also invalidate the all results list
      queryClient.invalidateQueries({ 
        queryKey: ["/api/results"] 
      });

      console.log('Payment successful - invalidated relevant caches for scanId:', { 
        scanId,
        leadId: confirmation.lead?.id 
      });
    }
  }, [isSuccessful, confirmation]);

  // Backend confirmation query to verify payment status
  const { data: confirmation, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/payments/confirm', sessionId],
    enabled: !!sessionId,
    retry: 3,
    retryDelay: 2000, // Wait 2 seconds between retries
    staleTime: 0, // Always check for fresh data
  });

  const isSuccessful = confirmation?.success && confirmation?.isSuccessful;
  const paymentData = confirmation?.payment;
  const leadData = confirmation?.lead;
  const sessionData = confirmation?.session;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation Header */}
      <nav className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Satellite className="text-primary-foreground w-4 h-4" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">Alien Probe</h1>
                  <p className="text-xs text-muted-foreground">Payment Success</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="outline" size="sm" data-testid="button-home">
                  <Home className="w-4 h-4 mr-2" />
                  Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Status Header */}
        <div className="text-center mb-8">
          {isLoading ? (
            <>
              <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
                <Clock className="text-muted-foreground w-10 h-10 animate-spin" />
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-4">
                Verifying Payment...
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Please wait while we confirm your payment with our secure systems.
              </p>
            </>
          ) : error || !confirmation?.success ? (
            <>
              <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <XCircle className="text-white w-10 h-10" />
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-4">
                Payment Verification Failed
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                We're having trouble verifying your payment. Please try refreshing the page.
              </p>
              <Button 
                onClick={() => refetch()} 
                className="mt-4"
                data-testid="button-retry-verification"
              >
                Retry Verification
              </Button>
            </>
          ) : isSuccessful ? (
            <>
              <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="text-white w-10 h-10" />
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-4">
                Payment Successful!
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Thank you for your purchase{leadData?.businessName ? ` for ${leadData.businessName}` : ''}. You now have full access to your detailed business scan report.
              </p>
            </>
          ) : (
            <>
              <div className="w-20 h-20 bg-yellow-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Clock className="text-white w-10 h-10" />
              </div>
              <h1 className="text-3xl font-bold text-foreground mb-4">
                Payment Processing
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Your payment is being processed. This may take a few moments to complete.
              </p>
            </>
          )}
        </div>

        {/* Status Details */}
        {isLoading ? (
          <Card className="mb-8" data-testid="card-payment-loading">
            <CardHeader>
              <Skeleton className="h-6 w-64" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-40" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </div>
            </CardContent>
          </Card>
        ) : error || !confirmation?.success ? (
          <Card className="mb-8 border-red-500/20 bg-gradient-to-br from-red-500/5 to-background" data-testid="card-payment-error">
            <CardHeader>
              <CardTitle className="flex items-center text-red-700 dark:text-red-400">
                <XCircle className="mr-3" />
                Payment Verification Issue
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert className="border-red-500/20 bg-red-500/10">
                <XCircle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-red-700 dark:text-red-400">
                  {error ? 'Unable to verify payment status. Please contact support if this issue persists.' : 
                   confirmation?.error || 'Payment verification failed. Please try again.'}
                </AlertDescription>
              </Alert>
              
              {sessionId && (
                <div className="pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    Session ID: {sessionId}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : isSuccessful ? (
          <Card className="mb-8 border-green-500/20 bg-gradient-to-br from-green-500/5 to-background" data-testid="card-payment-success">
            <CardHeader>
              <CardTitle className="flex items-center text-green-700 dark:text-green-400">
                <CheckCircle className="mr-3" />
                Full Business Analysis Unlocked
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert className="border-green-500/20 bg-green-500/10">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertDescription className="text-green-700 dark:text-green-400">
                  Your payment has been processed successfully. The detailed business analysis is now available for viewing.
                </AlertDescription>
              </Alert>
              
              {/* Payment Details */}
              {paymentData && (
                <div className="bg-muted/30 p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Payment Details</h4>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>Amount: ${(paymentData.amount / 100).toFixed(2)} {paymentData.currency.toUpperCase()}</p>
                    <p>Status: {paymentData.status}</p>
                    <p>Date: {new Date(paymentData.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">What You Get:</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start">
                    <CheckCircle className="text-green-500 w-4 h-4 mt-0.5 mr-2 flex-shrink-0" />
                    Complete competitive analysis
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="text-green-500 w-4 h-4 mt-0.5 mr-2 flex-shrink-0" />
                    Growth opportunity assessment
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="text-green-500 w-4 h-4 mt-0.5 mr-2 flex-shrink-0" />
                    Market positioning insights
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="text-green-500 w-4 h-4 mt-0.5 mr-2 flex-shrink-0" />
                    Actionable recommendations
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="text-green-500 w-4 h-4 mt-0.5 mr-2 flex-shrink-0" />
                    Risk assessment & mitigation
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="text-green-500 w-4 h-4 mt-0.5 mr-2 flex-shrink-0" />
                    Strategic planning guidance
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Next Steps:</h3>
                <div className="space-y-3">
                  <div className="flex items-center p-3 bg-muted/30 rounded-lg">
                    <Database className="text-primary w-5 h-5 mr-3" />
                    <span className="text-sm">View your detailed analysis</span>
                  </div>
                  <div className="flex items-center p-3 bg-muted/30 rounded-lg">
                    <Mail className="text-primary w-5 h-5 mr-3" />
                    <span className="text-sm">Check your email for receipt</span>
                  </div>
                  <div className="flex items-center p-3 bg-muted/30 rounded-lg">
                    <Download className="text-primary w-5 h-5 mr-3" />
                    <span className="text-sm">Access is permanent</span>
                  </div>
                </div>
              </div>
            </div>

              {(sessionId || paymentData?.id) && (
                <div className="pt-4 border-t border-border">
                  <div className="text-xs text-muted-foreground space-y-1">
                    {sessionId && <p>Session ID: {sessionId}</p>}
                    {paymentData?.id && <p>Payment ID: {paymentData.id}</p>}
                  </div>
                </div>
              )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {isSuccessful ? (
            <>
              <Link href="/results">
                <Button size="lg" className="px-8" data-testid="button-view-results">
                  <Database className="w-4 h-4 mr-2" />
                  View Your Results
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              
              <Link href="/">
                <Button variant="outline" size="lg" className="px-8" data-testid="button-scan-another">
                  Scan Another Business
                </Button>
              </Link>
            </>
          ) : !isLoading && (error || !confirmation?.success) ? (
            <>
              <Button 
                onClick={() => refetch()} 
                size="lg" 
                className="px-8" 
                data-testid="button-retry-payment"
              >
                Retry Verification
              </Button>
              
              <Link href="/">
                <Button variant="outline" size="lg" className="px-8" data-testid="button-back-home">
                  Back to Home
                </Button>
              </Link>
            </>
          ) : (
            <div className="flex justify-center">
              <Button disabled size="lg" className="px-8" data-testid="button-processing">
                <Clock className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </Button>
            </div>
          )}
        </div>

        {/* Support Message */}
        <div className="text-center mt-8 p-6 bg-muted/30 rounded-lg">
          <h3 className="font-medium mb-2">Need Help?</h3>
          <p className="text-sm text-muted-foreground">
            If you have any questions about your purchase or need assistance accessing your report, 
            please don't hesitate to contact our support team.
          </p>
        </div>
      </div>
    </div>
  );
}