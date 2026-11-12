import { useTranslation } from "react-i18next";
import React, { useState } from "react";
import { Key, Server, Box, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TrueNASApiKeyModal } from "./TrueNASApiKeyModal";

/**
 * Empty state card shown when TrueNAS API key is not configured
 * Encourages users to add API key to unlock enhanced features
 */
export function TrueNASApiKeyEmptyState() {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 rounded-xl border-2 border-dashed border-indigo-200 dark:border-indigo-800/50 p-8">
        <div className="flex flex-col items-center text-center space-y-4">
          
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-400/20 dark:bg-indigo-600/20 blur-xl rounded-full"></div>
            <div className="relative bg-white dark:bg-slate-800 rounded-full p-4 shadow-lg">
              <Key className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>

          
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t("Enhanced TrueNAS Features Available")}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md">
              {t("Add a TrueNAS API key to unlock advanced monitoring capabilities")}
            </p>
          </div>

          
          <div className="flex flex-col gap-2.5 w-full max-w-xs">
            <div className="flex items-center justify-center space-x-2 p-3 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
              <Server className="h-4 w-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t("Virtual Machines")}
              </span>
            </div>
            <div className="flex items-center justify-center space-x-2 p-3 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
              <Box className="h-4 w-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t("LXC Containers")}
              </span>
            </div>
            <div className="flex items-center justify-center space-x-2 p-3 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
              <BarChart3 className="h-4 w-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t("Enhanced System Info")}
              </span>
            </div>
          </div>

          
          <Button
            onClick={() => setIsModalOpen(true)}
            className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            {t("Setup Guide")}
          </Button>
        </div>
      </div>

      <TrueNASApiKeyModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
