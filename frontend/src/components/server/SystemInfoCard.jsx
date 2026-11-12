import { useTranslation } from "react-i18next";
import {
  Cpu,
  MemoryStick,
  Server as ServerIcon,
  Terminal,
  Package,
  Home,
  Clock,
  Container,
} from "lucide-react";
import { formatBytes, formatUptime } from "@/lib/utils";

function InfoItem({ icon, label, value, fullWidth = false }) {
  if (value === undefined || value === null || value === "") return null;
  const Icon = icon;
  return (
    <div
      className={`flex min-w-0 items-start justify-between text-sm ${
        fullWidth ? "col-span-2" : ""
      }`}
    >
      <div className="flex items-center text-slate-500 dark:text-slate-400 flex-shrink-0">
        <Icon className="h-4 w-4 mr-2 mt-0.5" />
        <span className="font-medium">{label}</span>
      </div>
      <span className="min-w-0 font-semibold text-slate-700 dark:text-slate-200 text-right break-words ml-2">
        {value}
      </span>
    </div>
  );
}

export function SystemInfoCard({ systemInfo, platformName }) {
  const { t } = useTranslation();
  if (!systemInfo) return null;

  const info = {
    hostname: systemInfo.hostname,
    os:
      platformName?.toLowerCase().includes("truenas") && systemInfo.version
        ? `TrueNAS ${systemInfo.version}`
        : systemInfo.operating_system,
    product: systemInfo.system_product,
    cpuModel: systemInfo.model || systemInfo.cpu?.model,
    cpuCores: systemInfo.cpu_cores || systemInfo.ncpu || systemInfo.cores,
    memory: systemInfo.physmem || systemInfo.total_mem || systemInfo.memory,
    uptime: systemInfo.uptime_seconds,
    dockerVersion: systemInfo.docker_version,
    containersRunning: systemInfo.containers_running,
    containersTotal: systemInfo.containers_total,
  };
  const memoryGb = info.memory ? info.memory / (1024 ** 3) : null;
  let memoryMessage = null;
  if (memoryGb != null) {
    if (memoryGb >= 128) {
      memoryMessage = "That's a lot of RAM.";
    } else if (memoryGb < 4) {
      memoryMessage = "Running lean. Respect.";
    }
  }

  const containerInfoValue = () => {
    const running = info.containersRunning;
    const total = info.containersTotal;

    if (running !== undefined && total !== undefined) {
      return t("{{running}} running / {{total}} total", { running, total });
    }
    if (running !== undefined) {
      return t("{{running}} running", { running });
    }
    return undefined;
  };

  return (
    <div className="@container bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50 p-6 h-full">
      <div className="space-y-3">
        
        <div className="space-y-2 border-b border-slate-200 dark:border-slate-700/50 pb-3">
          <InfoItem
            icon={Home}
            label={t("Hostname")}
            value={info.hostname}
            fullWidth={true}
          />
          <InfoItem
            icon={ServerIcon}
            label={t("Product")}
            value={info.product}
            fullWidth={true}
          />
          <InfoItem
            icon={Terminal}
            label={t("OS")}
            value={info.os}
            fullWidth={true}
          />
          <InfoItem
            icon={Cpu}
            label={t("CPU Model")}
            value={info.cpuModel}
            fullWidth={true}
          />
        </div>

        
        <div className="grid grid-cols-1 @[26rem]:grid-cols-2 gap-x-6 gap-y-2 pt-1">
          <InfoItem icon={Cpu} label={t("CPU Cores")} value={info.cpuCores} />
          <InfoItem
            icon={MemoryStick}
            label={t("Memory")}
            value={info.memory ? t("Total: {{memory}}", { memory: formatBytes(info.memory) }) : t("N/A")}
          />
          {memoryMessage && (
            <div className="col-span-full text-xs text-slate-500 dark:text-slate-400 italic">
              {t(memoryMessage)}
            </div>
          )}
          <InfoItem
            icon={Clock}
            label={t("Uptime")}
            value={info.uptime ? formatUptime(info.uptime) : t("N/A")}
          />
          <InfoItem
            icon={Container}
            label={t("Containers")}
            value={containerInfoValue()}
          />
          <InfoItem icon={Package} label="Docker" value={info.dockerVersion} />
        </div>
      </div>
    </div>
  );
}


