import { useTranslation } from "react-i18next";
import { Server, Zap, HardDrive, Box } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import { TrueNASApiKeyEmptyState } from "./TrueNASApiKeyEmptyState";

function VMItem({ vm }) {
  const { t } = useTranslation();
  const status = typeof vm.status === 'string' ? vm.status : (vm.status?.state || 'unknown');
  const isRunning = status.toLowerCase() === "running";
  const statusColor = isRunning ? "bg-green-500" : "bg-red-500";
  const isLXC = vm.platform_data?.container_type === "lxc";

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:shadow-md transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-600">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className={`w-2.5 h-2.5 rounded-full ${statusColor}`}></span>
            {isLXC ? (
              <Box className="h-6 w-6 text-slate-500 dark:text-slate-400" />
            ) : (
              <Server className="h-6 w-6 text-slate-500 dark:text-slate-400" />
            )}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h4 className="font-medium text-sm text-slate-900 dark:text-slate-100">
                {vm.name}
              </h4>
              {isLXC && (
                <span className="inline-flex items-center px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[10px] font-medium uppercase tracking-wide">
                  LXC
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
              {t(status)}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-3">
        {vm.vcpus && (
          <span className="inline-flex items-center px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-full text-xs font-medium">
            <Zap className="h-3 w-3 mr-1" />
            {vm.vcpus > 1 ? t("{{count}} vCPUs", { count: vm.vcpus }) : t("{{count}} vCPU", { count: vm.vcpus })}
          </span>
        )}
        {vm.memory && (
          <span className="inline-flex items-center px-2.5 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded-full text-xs font-medium">
            <HardDrive className="h-3 w-3 mr-1" />
            {formatBytes(vm.memory)}
          </span>
        )}
      </div>
    </div>
  );
}

export function VMsCard({ vms, enhancedFeaturesEnabled }) {
  const { t } = useTranslation();
  if (enhancedFeaturesEnabled === false) {
    return <TrueNASApiKeyEmptyState />;
  }

  if (!vms || vms.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 dark:text-slate-400">
        {t("No VMs detected. This server is living a simple, uncomplicated life.")}
      </div>
    );
  }

  return (
    <div className="p-6 pt-4 space-y-4">
      {vms.map((vm) => (
        <VMItem key={vm.id || vm.name} vm={vm} />
      ))}
    </div>
  );
}
