import { useTranslation } from "react-i18next";
import React from "react";
import { ArrowDownAZ, ArrowDownZA, ListOrdered, Undo2 } from "lucide-react";

const MODE_LABEL = { custom: "Custom", asc: "A-Z", desc: "Z-A" };
const NEXT_MODE = { custom: "asc", asc: "desc", desc: "custom" };
const MODE_ICON = {
  custom: ListOrdered,
  asc: ArrowDownAZ,
  desc: ArrowDownZA,
};

export function SidebarSortChip({ sortMode, onChange, undoState, onUndo }) {
  const { t } = useTranslation();
  const Icon = MODE_ICON[sortMode] || ListOrdered;
  const cycle = () => onChange(NEXT_MODE[sortMode] || "custom");
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={cycle}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
        aria-label={t("Sidebar order: {{order}}. Click to change.", { order: t(MODE_LABEL[sortMode]) })}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{t("Order: {{order}}", { order: t(MODE_LABEL[sortMode]) })}</span>
      </button>
      {undoState.visible && (
        <div
          role="status"
          className={`flex items-center justify-between gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 transition-all duration-200 ease-out ${
            undoState.closing ? "opacity-0 -translate-y-1" : "opacity-100 translate-y-0"
          }`}
        >
          <span className="truncate">
            {t("Switched to {{order}}.", { order: t(MODE_LABEL[sortMode]) })}
          </span>
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-slate-50 hover:underline"
          >
            <Undo2 className="h-3 w-3" />
            {t("Back to {{order}}", { order: t(MODE_LABEL[undoState.previousMode] || "Custom") })}
          </button>
        </div>
      )}
    </div>
  );
}
