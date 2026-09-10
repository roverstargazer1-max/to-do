import { notify } from "@/lib/notify";
import { tr } from "@/lib/i18n/tr";

export function handleMutationError(err: unknown) {
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    notify.error(tr("common.errors.network"));
    return;
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();

    if (
      msg.includes("401") ||
      msg.includes("not authenticated") ||
      msg.includes("unauthorized")
    ) {
      notify.error(tr("common.errors.auth"));
      return;
    }

    notify.error(err.message || tr("common.errors.generic"));
    return;
  }

  notify.error(tr("common.errors.unexpected"));
}
