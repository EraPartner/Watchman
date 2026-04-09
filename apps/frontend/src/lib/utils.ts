import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number with K/M suffixes for large values
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

/**
 * Format bytes to human-readable format
 */
export function formatBytes(
  bytes: number | null | undefined,
  decimals: number = 1
): string {
  if (bytes === null || bytes === undefined) return "N/A";
  if (!Number.isFinite(bytes) || bytes === 0) return "0 B";
  const b = Math.max(0, bytes);
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((b / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format seconds to uptime string
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Format bytes per second to speed string
 */
export function formatSpeed(bytesPerSecond: number | null | undefined): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Build a display name for a potentially multi-instance service
 */
export function instanceDisplayName(
  name: string,
  instanceNumber?: number
): string {
  return instanceNumber ? `${name} #${instanceNumber}` : name;
}
