import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Badge } from "./ui/badge";

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

export const UpdateBadge = ({ service, className = "" }: UpdateBadgeProps) => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkUpdates = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log(`[UpdateBadge] Checking updates for ${service}...`);

        // Use relative URL - let the browser/proxy handle it
        const response = await fetch(`/api/${service}/updates`, {
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });

        console.log(
          `[UpdateBadge] ${service} response status:`,
          response.status,
        );

        if (!response.ok) {
          if (response.status === 503) {
            // Service not configured - silently hide the badge
            console.log(`[UpdateBadge] ${service} not configured (503)`);
            setUpdateInfo(null);
            return;
          }
          const errorText = await response.text().catch(() => "Unknown error");
          console.error(
            `[UpdateBadge] ${service} error:`,
            response.status,
            errorText,
          );
          throw new Error(`Failed to check updates: ${response.status}`);
        }

        const data = await response.json();
        console.log(`[UpdateBadge] ${service} update info:`, data);
        setUpdateInfo(data);
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to check updates";
        setError(errorMsg);
        console.error(`[UpdateBadge] Error checking ${service} updates:`, err);
      } finally {
        setLoading(false);
      }
    };

    // Start checking immediately
    checkUpdates();

    // Check for updates every 6 hours
    const interval = setInterval(checkUpdates, 6 * 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [service]);

  // Show loading state briefly
  if (loading) {
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
    console.log(
      `[UpdateBadge] ${service} is up to date: ${updateInfo.currentVersion}`,
    );
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
