import { useEffect, useRef, useState } from "react";
import { useDownloadsStore } from "../store/downloads";
import { useAccounts } from "./useAccounts";
import { accountHash } from "../utils/account";

export function useDownloads() {
  const {
    tasks,
    loading,
    setAccountHashes,
    fetchTasks,
    startDownload,
    pauseDownload,
    resumeDownload,
    deleteDownload,
  } = useDownloadsStore();
  const { accounts } = useAccounts();
  const hashesRef = useRef("");
  const [hashToEmail, setHashToEmail] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Calculate original hashes preserving the order corresponding to 'accounts'
      const hashes = await Promise.all(accounts.map((a) => accountHash(a)));
      // Use slice() before sort() so we don't mutate the original 'hashes' array
      const key = hashes.slice().sort().join(",");
      if (cancelled || key === hashesRef.current) return;
      hashesRef.current = key;

      const map: Record<string, string> = {};
      for (let i = 0; i < accounts.length; i++) {
        // Now hashes[i] correctly maps to accounts[i]
        map[hashes[i]] = accounts[i].email;
      }
      setHashToEmail(map);

      setAccountHashes(hashes);
      // Fetch immediately after hashes are set so downloads appear on first visit
      fetchTasks();
    })();
    return () => {
      cancelled = true;
    };
  }, [accounts, setAccountHashes, fetchTasks]);

  return {
    tasks,
    loading,
    hashToEmail,
    fetchTasks,
    startDownload,
    pauseDownload,
    resumeDownload,
    deleteDownload,
  };
}
