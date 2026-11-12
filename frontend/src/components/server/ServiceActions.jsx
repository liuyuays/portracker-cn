import { useTranslation } from "react-i18next";
import { EyeOff, Tag } from "lucide-react";
import { ActionButton } from "./ActionButton";

const NO_FEEDBACK = {};

// Service headers toggle on click, so keep button clicks from reaching them.
function StopClicks({ className = "", children }) {
  return (
    <span className={`inline-flex flex-shrink-0 ${className}`} onClick={(e) => e.stopPropagation()}>
      {children}
    </span>
  );
}

/** Edit-alias button shown right after the service name, like "Rename service" on ports. */
export function ServiceAliasButton({ onEditAlias, className = "" }) {
  const { t } = useTranslation();
  if (!onEditAlias) return null;
  return (
    <StopClicks className={`opacity-40 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ${className}`}>
      <ActionButton
        type="alias"
        actionFeedback={NO_FEEDBACK}
        onClick={onEditAlias}
        icon={Tag}
        title={t("Edit alias")}
        size="sm"
      />
    </StopClicks>
  );
}

/** Hides the whole service; restored from the "Hidden Services" drawer. */
export function ServiceHideButton({ onHideService, className = "" }) {
  const { t } = useTranslation();
  if (!onHideService) return null;
  return (
    <StopClicks className={className}>
      <ActionButton
        type="hideService"
        actionFeedback={NO_FEEDBACK}
        onClick={onHideService}
        icon={EyeOff}
        title={t("Hide service")}
        size="sm"
      />
    </StopClicks>
  );
}
