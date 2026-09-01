import { useEffect } from "react";
import { useAccountsStore } from "../store/accounts";
import { useSapStore } from "../store/sap";
import { prepareSigner } from "../apple/sap/client";

// Starts preparing the SAP signer in the background.
//
// It takes a minute or two — 38 MB of Apple binaries, then ten million
// emulated instructions — so waiting until someone presses a button means
// that button appears dead for the whole of it. Starting on load instead
// means the work is usually done, or well along, by the time it is wanted,
// and a button pressed mid-way can show the progress already being made.
//
// Only started once an account exists, because a signer is bound to the
// hardware id it was initialised with and there is nothing to bind to
// otherwise. A session that never signs in still pays for the assets, which
// is why it waits for that signal rather than firing on first paint.
export function useSapWarmup() {
  const accounts = useAccountsStore((state) => state.accounts);
  const stage = useSapStore((state) => state.stage);

  useEffect(() => {
    if (stage !== "idle") return;

    const device = accounts.find((account) => account.deviceIdentifier)
      ?.deviceIdentifier;
    if (!device) return;

    // Fire and forget: the store carries the outcome, and a failure here
    // should not surface until something actually needs a signature.
    prepareSigner(device).catch(() => {});
  }, [accounts, stage]);
}
