import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ResultsTable from "@/components/results-table";
import { Satellite, ArrowLeft, Database } from "lucide-react";

export default function ScanResults() {
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
                  <p className="text-xs text-muted-foreground">Scan Results</p>
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-xl mb-6">
            <Database className="text-primary-foreground w-8 h-8" />
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Business Scan Results
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            View all completed business scans and their insights. Track your analysis history and discover trends.
          </p>
        </div>

        {/* Results Table */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold text-foreground flex items-center">
              <Database className="text-primary mr-3" />
              Scan History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResultsTable />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
