import { el } from "../dom";
import { t, type Language } from "../../shared/i18n";

export function showConfirmDialog(options: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  lang?: Language;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const lang: Language = options.lang ?? "cs";

    const close = (result: boolean) => {
      backdrop.remove();
      resolve(result);
    };

    const cancelBtn = el("button", {
      className: "btn",
      text: t(lang, "common.cancel"),
      onClick: () => close(false),
    });
    const confirmBtn = el("button", {
      className: `btn ${options.danger ? "danger" : "primary"}`,
      text: options.confirmLabel ?? t(lang, "common.confirm"),
      onClick: () => close(true),
    });

    const modal = el("div", { className: "modal" }, [
      el("h3", { text: options.title }),
      el("p", { text: options.message }),
      el("div", { className: "modal-actions" }, [cancelBtn, confirmBtn]),
    ]);

    const backdrop = el(
      "div",
      {
        className: "modal-backdrop",
        onClick: (e) => {
          if (e.target === backdrop) close(false);
        },
      },
      [modal],
    );

    document.body.append(backdrop);
  });
}
