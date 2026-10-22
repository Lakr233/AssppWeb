import { useEffect } from 'react';
import { useAccounts } from '../../hooks/useAccounts';
import { prefetchKBSync } from '../../apple/kbsync';

// Lets the page finish loading before the CPU-heavy emulation starts.
const PREFETCH_DELAY_MS = 3000;

/**
 * Invisible component mounted at App root.
 * Generates each account's kbsync in the background so the first download
 * does not wait for the StoreAgent emulation.
 */
export default function KBSyncPrefetcher() {
  const { accounts, loading } = useAccounts();

  useEffect(() => {
    if (loading || accounts.length === 0 || typeof Worker === 'undefined') {
      return;
    }
    const timer = setTimeout(() => prefetchKBSync(accounts), PREFETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [accounts, loading]);

  return null;
}
