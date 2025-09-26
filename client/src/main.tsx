import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Draft persistence utility to prevent text loss during app updates
const DRAFT_STORAGE_KEY = 'app-drafts';
const FOCUS_STORAGE_KEY = 'app-focus';

function snapshotDraftsAndFocus() {
  try {
    const drafts: Record<string, string> = {};
    const focusInfo: { selector?: string; selectionStart?: number; selectionEnd?: number } = {};
    
    // Save all input/textarea values with data-testid or data-preserve attributes
    document.querySelectorAll('input[data-testid], textarea[data-testid], input[data-preserve], textarea[data-preserve]').forEach((element) => {
      const input = element as HTMLInputElement | HTMLTextAreaElement;
      const key = input.getAttribute('data-testid') || input.getAttribute('data-preserve') || input.id;
      if (key && input.value) {
        drafts[key] = input.value;
      }
    });
    
    // Save focus and cursor position
    const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      const key = activeElement.getAttribute('data-testid') || activeElement.getAttribute('data-preserve') || activeElement.id;
      if (key) {
        focusInfo.selector = `[data-testid="${key}"], [data-preserve="${key}"], #${key}`;
        focusInfo.selectionStart = activeElement.selectionStart || 0;
        focusInfo.selectionEnd = activeElement.selectionEnd || 0;
      }
    }
    
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
    sessionStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(focusInfo));
    console.log('Snapshots saved:', { drafts, focusInfo });
  } catch (error) {
    console.warn('Failed to snapshot drafts:', error);
  }
}

// Set up HMR event listener for development
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', () => {
    console.log('HMR beforeFullReload triggered, saving drafts...');
    snapshotDraftsAndFocus();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
