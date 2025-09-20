import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import ScanResults from "@/pages/scan-results";
import ScanDetail from "@/pages/scan-detail";
import PaymentSuccess from "@/pages/payment-success";
import PaymentCancel from "@/pages/payment-cancel";
import Workflows from "@/pages/workflows";
import NotFound from "@/pages/not-found";
import ChatWidget from "@/components/ChatWidget";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/results" component={ScanResults} />
      <Route path="/scan/:scanId" component={ScanDetail} />
      <Route path="/workflows" component={Workflows} />
      <Route path="/workflows/:id" component={Workflows} />
      <Route path="/workflows/:id/versions/:versionId" component={Workflows} />
      <Route path="/workflows/:id/runs" component={Workflows} />
      <Route path="/payment-success" component={PaymentSuccess} />
      <Route path="/payment-cancel" component={PaymentCancel} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        <ChatWidget />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
