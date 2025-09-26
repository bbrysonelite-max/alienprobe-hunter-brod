import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for persisting draft text in sessionStorage to survive app updates
 * @param key - Unique storage key for this draft
 * @param initialValue - Initial value for the draft
 * @returns [value, setValue, clearDraft] tuple
 */
export function usePersistentDraft(key: string, initialValue: string = '') {
  const storageKey = `draft_${key}`;
  
  // Get initial value from storage or use provided initial value
  const getInitialValue = useCallback(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      console.log(`[usePersistentDraft] Loading draft for ${key}:`, stored);
      return stored !== null ? stored : initialValue;
    } catch (error) {
      console.warn(`Failed to load draft for ${key}:`, error);
      return initialValue;
    }
  }, [storageKey, initialValue, key]);

  const [value, setValue] = useState<string>(() => getInitialValue());

  // Save to sessionStorage whenever value changes
  useEffect(() => {
    try {
      console.log(`[usePersistentDraft] Saving draft for ${key}:`, value);
      if (value) {
        sessionStorage.setItem(storageKey, value);
        console.log(`[usePersistentDraft] Saved to ${storageKey}:`, value);
      } else {
        sessionStorage.removeItem(storageKey);
        console.log(`[usePersistentDraft] Removed ${storageKey} (empty value)`);
      }
    } catch (error) {
      console.warn(`Failed to save draft for ${key}:`, error);
    }
  }, [value, storageKey, key]);

  // Clear draft function
  const clearDraft = useCallback(() => {
    try {
      console.log(`[usePersistentDraft] Clearing draft for ${key}`);
      sessionStorage.removeItem(storageKey);
      setValue('');
    } catch (error) {
      console.warn(`Failed to clear draft for ${key}:`, error);
    }
  }, [storageKey, key]);

  return [value, setValue, clearDraft] as const;
}