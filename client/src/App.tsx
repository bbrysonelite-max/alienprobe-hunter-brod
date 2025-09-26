import { useEffect } from "react";
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
import Performance from "@/pages/performance";
import Admin from "@/pages/admin";
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
      <Route path="/performance" component={Performance} />
      <Route path="/admin" component={Admin} />
      <Route path="/payment-success" component={PaymentSuccess} />
      <Route path="/payment-cancel" component={PaymentCancel} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Restore drafts after React app mounts
  useEffect(() => {
    console.log('[App] Mounted, checking for drafts to restore...');
    const restoreDraftsAndFocus = () => {
      try {
        const draftsJson = sessionStorage.getItem('app-drafts');
        const focusJson = sessionStorage.getItem('app-focus');
        
        if (draftsJson) {
          const drafts = JSON.parse(draftsJson);
          console.log('[App] Found drafts to restore:', drafts);
          
          // Restore draft values with a delay to ensure React components are mounted
          setTimeout(() => {
            Object.entries(drafts).forEach(([key, value]) => {
              const element = document.querySelector(`[data-testid="${key}"], [data-preserve="${key}"], #${key}`) as HTMLInputElement | HTMLTextAreaElement;
              if (element && value) {
                console.log(`[App] Restoring draft for ${key}:`, value);
                element.value = value as string;
                // Dispatch input event to sync with React controlled components
                element.dispatchEvent(new Event('input', { bubbles: true }));
              }
            });
            
            // Restore focus and cursor position
            if (focusJson) {
              const focusInfo = JSON.parse(focusJson);
              if (focusInfo.selector) {
                const element = document.querySelector(focusInfo.selector) as HTMLInputElement | HTMLTextAreaElement;
                if (element) {
                  element.focus();
                  if (typeof focusInfo.selectionStart === 'number') {
                    element.setSelectionRange(focusInfo.selectionStart, focusInfo.selectionEnd || focusInfo.selectionStart);
                  }
                }
              }
            }
            
            // Clean up storage
            sessionStorage.removeItem('app-drafts');
            sessionStorage.removeItem('app-focus');
          }, 200);
        }
      } catch (error) {
        console.warn('[App] Failed to restore drafts:', error);
      }
    };
    
    restoreDraftsAndFocus();
  }, []);

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
