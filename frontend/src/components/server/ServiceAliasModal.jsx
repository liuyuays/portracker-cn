import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatServiceName } from "../../lib/service-settings";

const MAX_ALIAS_LENGTH = 100;

/**
 * Edits the alias shown after a service name as "name (alias)".
 * Saving an empty alias removes it.
 */
export function ServiceAliasModal({ service, onClose, onSave }) {
  const { t } = useTranslation();
  const [alias, setAlias] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setAlias(service?.alias || "");
    setSaving(false);
    setFailed(false);
  }, [service]);

  if (!service) return null;

  const save = async (value) => {
    setSaving(true);
    setFailed(false);
    const ok = await onSave(service, value);
    setSaving(false);
    if (ok) onClose();
    else setFailed(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!saving) save(alias);
  };

  return (
    <Dialog open={!!service} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("Edit alias")}</DialogTitle>
            <DialogDescription>
              {t("Shown after the service name in parentheses. Leave empty to remove it.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Input
              autoFocus
              value={alias}
              maxLength={MAX_ALIAS_LENGTH}
              onChange={(e) => setAlias(e.target.value)}
              placeholder={t("Alias")}
              aria-label={t("Alias")}
            />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("Preview:")} <span className="font-medium text-slate-900 dark:text-slate-100">{formatServiceName(service.name, alias)}</span>
            </p>
            {failed && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {t("Failed to save alias. Please try again.")}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            {service.alias && (
              <Button type="button" variant="outline" disabled={saving} onClick={() => save("")}>
                {t("Remove alias")}
              </Button>
            )}
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {t("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
