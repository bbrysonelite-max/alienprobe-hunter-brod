import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  XCircle, 
  ArrowLeft, 
  CreditCard, 
  Satellite,
  Home,
  RefreshCw
} from "lucide-react";

export default function PaymentCancel() {
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
                  <p className="text-xs text-muted-foreground">Payment Cancelled</p>
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
        {/* Cancel Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-4">
            Payment Cancelled
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            No charges have been made to your account. You can try again anytime or continue with the free basic scan results.
          </p>
        </div>

        {/* Cancel Details */}
        <Card className="mb-8 border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-background" data-testid="card-payment-cancel">
          <CardHeader>
            <CardTitle className="flex items-center text-orange-700 dark:text-orange-400">
              <XCircle className="mr-3" />
              Payment Not Completed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert className="border-orange-500/20 bg-orange-500/10">
              <XCircle className="h-4 w-4 text-orange-500" />
              <AlertDescription className="text-orange-700 dark:text-orange-400">
                Your payment was cancelled or interrupted. No charges have been processed.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">What Happened?</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start">
                    <XCircle className="text-orange-500 w-4 h-4 mt-0.5 mr-2 flex-shrink-0" />
                    Payment process was interrupted
                  </li>
                  <li className="flex items-start">
                    <XCircle className="text-orange-500 w-4 h-4 mt-0.5 mr-2 flex-shrink-0" />
                    No charges were made
                  </li>
                  <li className="flex items-start">
                    <XCircle className="text-orange-500 w-4 h-4 mt-0.5 mr-2 flex-shrink-0" />
                    Your card was not processed
                  </li>
                  <li className="flex items-start">
                    <XCircle className="text-orange-500 w-4 h-4 mt-0.5 mr-2 flex-shrink-0" />
                    Session was cancelled by user
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Your Options:</h3>
                <div className="space-y-3">
                  <div className="flex items-center p-3 bg-muted/30 rounded-lg">
                    <RefreshCw className="text-primary w-5 h-5 mr-3" />
                    <span className="text-sm">Try payment again</span>
                  </div>
                  <div className="flex items-center p-3 bg-muted/30 rounded-lg">
                    <ArrowLeft className="text-primary w-5 h-5 mr-3" />
                    <span className="text-sm">Return to scan results</span>
                  </div>
                  <div className="flex items-center p-3 bg-muted/30 rounded-lg">
                    <Satellite className="text-primary w-5 h-5 mr-3" />
                    <span className="text-sm">Continue with free results</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="font-medium mb-2">Still Want Full Access?</h4>
              <p className="text-sm text-muted-foreground mb-3">
                You can always upgrade to unlock the complete business analysis with detailed insights, 
                competitive analysis, and actionable recommendations.
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Detailed competitive analysis</li>
                <li>• Growth opportunity assessment</li>
                <li>• Market positioning insights</li>
                <li>• Strategic planning guidance</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/results">
            <Button size="lg" className="px-8" data-testid="button-back-to-results">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Results
            </Button>
          </Link>
          
          <Link href="/">
            <Button variant="outline" size="lg" className="px-8" data-testid="button-new-scan">
              <Satellite className="w-4 h-4 mr-2" />
              Start New Scan
            </Button>
          </Link>
        </div>

        {/* Help Message */}
        <div className="text-center mt-8 p-6 bg-muted/30 rounded-lg">
          <h3 className="font-medium mb-2">Need Assistance?</h3>
          <p className="text-sm text-muted-foreground">
            If you experienced any issues during checkout or have questions about our pricing, 
            please contact our support team for assistance.
          </p>
        </div>
      </div>
    </div>
  );
}