import { useTranslation } from "react-i18next";
import { useSapStore } from "../../store/sap";

/**
 * What the SAP signer is doing, for screens with a button that will wait on
 * it. Renders nothing when it is idle or ready, so it can be dropped in
 * without reserving space for the common case.
 *
 * The signer starts preparing in the background on load, so this is usually
 * showing progress already under way rather than something a press started.
 */
export default function SapStatus() {
  const { t } = useTranslation();
  const stage = useSapStore((state) => state.stage);
  const percent = useSapStore((state) => state.percent);
  const error = useSapStore((state) => state.error);

  if (stage === "idle" || stage === "ready") return null;

  if (stage === "error") {
    return (
      <span className="text-sm text-red-600 dark:text-red-400">
        {t("accounts.addForm.signerFailed", { error: error ?? "" })}
      </span>
    );
  }

  return (
    <span className="text-sm text-gray-600 dark:text-gray-400">
      {stage === "assets"
        ? t("accounts.addForm.preparingAssets", { percent: percent ?? 0 })
        : t("accounts.addForm.preparingSigner")}
    </span>
  );
}
