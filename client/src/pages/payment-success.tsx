import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle } from "lucide-react";

export default function PaymentSuccess() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation Header */}
      <nav className="bg-card border-b border-border sticky top-0 z-50 backdrop-blur-sm bg-card/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <CheckCircle className="text-primary-foreground w-4 h-4" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">AlianProbe.ai</h1>
                  <p className="text-xs text-muted-foreground">Payment Success</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
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

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Success Message */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold text-foreground flex items-center">
              <CheckCircle className="text-green-600 mr-3" />
              Payment Successful!
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-6">
              Your payment has been processed successfully. You now have access to your premium business analysis.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/results">
                <Button size="lg" className="px-8" data-testid="button-view-results">
                  View Your Results
                </Button>
              </Link>
              
              <Link href="/">
                <Button variant="outline" size="lg" className="px-8" data-testid="button-scan-another">
                  Scan Another Business
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}