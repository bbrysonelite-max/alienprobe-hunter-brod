import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ScanForm from "@/components/scan-form";
import { Rocket, Satellite, Database, Shield, Activity, Settings, BarChart3, MessageCircle, Send } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [message, setMessage] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const { toast } = useToast();

  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await apiRequest("POST", "/api/chat", {
        message: text,
        context: {}
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setAiResponse(data.response);
        setMessage("");
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to send message",
          variant: "destructive"
        });
      }
    },
    onError: () => {
      toast({
        title: "Connection Error",
        description: "Unable to send message. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleSendMessage = () => {
    if (!message.trim() || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(message.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

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
                  <h1 className="text-xl font-bold text-foreground">AlienProbe.ai</h1>
                  <p className="text-xs text-muted-foreground">Business Scanner</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent border border-accent/20">
                <Activity className="w-3 h-3 text-accent mr-1.5" />
                Online
              </span>
              <Link href="/performance">
                <Button variant="outline" size="sm" data-testid="button-performance">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Performance
                </Button>
              </Link>
              <Link href="/workflows">
                <Button variant="outline" size="sm" data-testid="button-workflow-admin">
                  <Settings className="w-4 h-4 mr-2" />
                  Workflow Admin
                </Button>
              </Link>
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
            AlienProbe.ai Business Scanner
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

        {/* AI Chat Interface */}
        <div className="max-w-4xl mx-auto mb-12">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold text-foreground text-center flex items-center justify-center">
                <MessageCircle className="mr-3 text-primary" />
                AI Workflow Assistant
              </CardTitle>
              <p className="text-muted-foreground text-center">
                Ask me about business workflows, lead processing, automation, or get strategic insights
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex space-x-3">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message here... (Press Enter to send)"
                  className="flex-1 min-h-[80px] resize-none"
                  data-testid="input-ai-message"
                />
                <Button 
                  onClick={handleSendMessage}
                  disabled={!message.trim() || sendMessageMutation.isPending}
                  className="self-end"
                  data-testid="button-send-ai-message"
                >
                  {sendMessageMutation.isPending ? (
                    <Activity className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
              
              {aiResponse && (
                <div className="mt-4 p-4 bg-secondary rounded-lg border border-border">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                      <Satellite className="w-4 h-4 text-primary-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground mb-1">AI Assistant</p>
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="ai-response">
                        {aiResponse}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
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
            Why Choose AlienProbe.ai?
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
