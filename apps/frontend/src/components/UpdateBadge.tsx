import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Badge } from "./ui/badge";
import { apiClient } from "../services/ApiClient";
import { logger } from "../lib/logger";
import { queryKeys } from "../lib/queryKeys";

interface UpdateInfo {
  currentVersion: string;
  updateAvailable: boolean;
  latestVersion: string;
  releaseUrl?: string;
  recommendedUrl?: string;
}

interface UpdateBadgeProps {
  service: "adguard" | "bitcoin" | "tor" | "ipfs" | "homebridge";
  className?: string;
}

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const UpdateBadge = ({ service, className = "" }: UpdateBadgeProps) => {
  const {
    data: updateInfo,
    isLoading,
    error,
  } = useQuery<UpdateInfo | null>({
    queryKey: queryKeys.serviceUpdates(service),
    queryFn: async () => {
      try {
        return await apiClient.getServiceUpdates(service);
      } catch (err) {
        const status =
          typeof err === "object" && err !== null && "status" in err
            ? Number((err as { status?: unknown }).status)
            : undefined;

        if (status === 503) {
          logger.debug("[UpdateBadge] Service not configured", { service });
          return null;
        }

        throw err;
      }
    },
    retry: false,
    staleTime: UPDATE_CHECK_INTERVAL_MS,
    refetchInterval: UPDATE_CHECK_INTERVAL_MS,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!error) return;

    logger.warn("[UpdateBadge] Failed to check updates", {
      service,
      error: error instanceof Error ? error.message : String(error),
    });
  }, [error, service]);

  // Show loading state briefly
  if (isLoading) {
    return (
      <Badge variant="outline" className={`text-xs ${className}`}>
        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
        Checking...
      </Badge>
    );
  }

  // Hide on error or no data
  if (error || !updateInfo) {
    return null;
  }

  // Hide if no update available
  if (!updateInfo.updateAvailable) {
    return null;
  }

  const handleClick = () => {
    const url = updateInfo.releaseUrl || updateInfo.recommendedUrl;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Badge
      variant="destructive"
      className={`text-xs cursor-pointer hover:bg-red-700 transition-colors ${className}`}
      onClick={handleClick}
      title={`Update available: ${updateInfo.currentVersion} → ${updateInfo.latestVersion}\nClick to view release notes`}
    >
      <AlertCircle className="h-3 w-3 mr-1" />
      Update: {updateInfo.latestVersion}
    </Badge>
  );
};
