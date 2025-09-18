import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ScanForm from "@/components/scan-form";
import { Rocket, Satellite, Database, Shield, Activity } from "lucide-react";

export default function Home() {
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
                  <p className="text-xs text-muted-foreground">Business Scanner</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20">
                <Activity className="w-3 h-3 text-accent mr-1.5" />
                Online
              </span>
              <Link href="/results">
                <Button variant="outline" size="sm" data-testid="button-view-results">
                  View Results
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-xl mb-6">
            <Rocket className="text-primary-foreground w-8 h-8" />
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Alien Probe Business Scanner
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Discover hidden insights and opportunities in your business with our advanced scanning technology. 
            Get comprehensive analysis and actionable recommendations.
          </p>
        </div>

        {/* Architecture Overview */}
        <div className="bg-card rounded-xl border border-border p-8 mb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-6 flex items-center">
            <Database className="text-primary mr-3" />
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center p-6 bg-secondary rounded-lg">
              <div className="w-12 h-12 bg-primary rounded-lg mx-auto mb-4 flex items-center justify-center">
                <Satellite className="text-primary-foreground w-6 h-6" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Deep Scan</h3>
              <p className="text-muted-foreground text-sm">Advanced algorithms analyze your business structure and online presence</p>
            </div>
            <div className="text-center p-6 bg-secondary rounded-lg">
              <div className="w-12 h-12 bg-accent rounded-lg mx-auto mb-4 flex items-center justify-center">
                <Database className="text-accent-foreground w-6 h-6" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Data Analysis</h3>
              <p className="text-muted-foreground text-sm">Process and correlate findings to identify patterns and opportunities</p>
            </div>
            <div className="text-center p-6 bg-secondary rounded-lg">
              <div className="w-12 h-12 bg-purple-500 rounded-lg mx-auto mb-4 flex items-center justify-center">
                <Shield className="text-white w-6 h-6" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Insights</h3>
              <p className="text-muted-foreground text-sm">Generate actionable recommendations for business growth</p>
            </div>
          </div>
        </div>

        {/* Scan Form */}
        <div className="max-w-2xl mx-auto">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold text-foreground text-center">
                Start Your Business Scan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScanForm />
            </CardContent>
          </Card>
        </div>

        {/* Features */}
        <div className="mt-12 bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl border border-primary/20 p-8">
          <h2 className="text-2xl font-semibold text-foreground mb-6 flex items-center">
            <Rocket className="text-primary mr-3" />
            Why Choose Alien Probe?
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-foreground mb-3 flex items-center">
                <Shield className="text-blue-400 mr-2 w-5 h-5" />
                Comprehensive Analysis
              </h3>
              <ul className="space-y-2 text-muted-foreground text-sm">
                <li className="flex items-center"><Activity className="text-accent mr-2 w-4 h-4" />Website performance analysis</li>
                <li className="flex items-center"><Activity className="text-accent mr-2 w-4 h-4" />Market position assessment</li>
                <li className="flex items-center"><Activity className="text-accent mr-2 w-4 h-4" />Competitive landscape review</li>
                <li className="flex items-center"><Activity className="text-accent mr-2 w-4 h-4" />Growth opportunity identification</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-3 flex items-center">
                <Database className="text-green-400 mr-2 w-5 h-5" />
                Advanced Technology
              </h3>
              <ul className="space-y-2 text-muted-foreground text-sm">
                <li className="flex items-center"><Activity className="text-accent mr-2 w-4 h-4" />Real-time scanning engine</li>
                <li className="flex items-center"><Activity className="text-accent mr-2 w-4 h-4" />AI-powered insights</li>
                <li className="flex items-center"><Activity className="text-accent mr-2 w-4 h-4" />Secure data processing</li>
                <li className="flex items-center"><Activity className="text-accent mr-2 w-4 h-4" />Detailed reporting system</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 p-4 bg-accent/10 rounded-lg border border-accent/20">
            <p className="text-accent text-sm font-medium flex items-center">
              <Satellite className="mr-2 w-4 h-4" />
              Ready to discover what your business scan reveals? Start exploring new possibilities! 🛸
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
