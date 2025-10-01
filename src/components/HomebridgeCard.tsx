import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Server, AlertCircle, ExternalLink } from 'lucide-react';
import { ServerStatusBadge } from './ServerStatusBadge';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/ApiClient';
import { APP_CONFIG } from '../lib/constants';
import { formatDisplayUrl, buildHref, openHref } from '../lib/url';

const HomebridgeCard: React.FC = () => {
	// Only fetch server-information and version from the allowed API endpoints.
	// These are the canonical sources: /api/status/server-information and /api/status/homebridge-version
	const serverInfoQuery = useQuery({
		queryKey: ['homebridge', 'server-information'],
		queryFn: () => apiClient.getHomebridgeServerInformation(),
		refetchInterval: APP_CONFIG.ADGUARD_REFRESH_INTERVAL,
		retry: 1,
	});

	const versionQuery = useQuery({
		queryKey: ['homebridge', 'version'],
		queryFn: () => apiClient.getHomebridgeVersion(),
		refetchInterval: APP_CONFIG.ADGUARD_REFRESH_INTERVAL,
		retry: 1,
	});

	const loading = serverInfoQuery.isLoading || versionQuery.isLoading || serverInfoQuery.isFetching || versionQuery.isFetching;
	const serverInfoResp = serverInfoQuery.data as any;
	const versionResp = versionQuery.data as any;

	// Prefer react-query statuses: success = online, error = hasError
	const isOnline = serverInfoQuery.isSuccess || versionQuery.isSuccess;
	const hasError = serverInfoQuery.isError || versionQuery.isError;

	// Query-level error messages (react-query stores thrown errors here)
	const serverQueryError = serverInfoQuery.isError ? (serverInfoQuery.error as any)?.message || String(serverInfoQuery.error) : null;
	const versionQueryError = versionQuery.isError ? (versionQuery.error as any)?.message || String(versionQuery.error) : null;

	// Combined error message to show in the UI (prefer query errors, then API-provided error fields)
	const errorMessage = serverQueryError || versionQueryError || serverInfoResp?.error || versionResp?.error || null;

	// Normalize server data for host extraction (support either resp.data or resp directly)
	const serverData = serverInfoResp && (serverInfoResp.data || serverInfoResp);
	const hostValue = serverData && (serverData.hostname || serverData.host || serverData.url || serverData.baseUrl) || null;
	let hostHref: string | null = null;
	if (hostValue) {
		try {
			let base = hostValue as string;
			if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
			const u = new URL(base);
			hostHref = u.toString();
		} catch (err) {
			hostHref = hostValue ? `http://${hostValue}` : null;
		}
	}

	// Helper to safely read nested fields from various shapes
	const getFirst = (obj: any, paths: string[][]) => {
		for (const p of paths) {
			let cur = obj;
			let ok = true;
			for (const k of p) {
				if (cur == null) { ok = false; break; }
				cur = cur[k];
			}
			if (ok && cur !== undefined && cur !== null) return cur;
		}
		return null;
	};

	// Helper to pretty-print server information safely, with uptime formatting
	const formatUptime = (u: any) => {
		if (u == null) return null;
		// If it's a number (seconds), convert to human friendly string
		const n = Number(u);
		if (!Number.isNaN(n)) {
			if (n < 60) return `${n}s`;
			const hours = Math.floor(n / 3600);
			const minutes = Math.floor((n % 3600) / 60);
			const parts: string[] = [];
			if (hours) parts.push(`${hours}h`);
			if (minutes) parts.push(`${minutes}m`);
			if (!hours && !minutes) parts.push(`${n}s`);
			return parts.join(' ');
		}
		// Otherwise return as-is (string)
		return String(u);
	};

	// Helper to extract a readable version string from the version endpoint response
	const versionDisplay = (() => {
		const vr = versionResp;
		if (!vr) return null;
		if (typeof vr === 'object') {
			// check common places
			return vr.version || vr.homebridgeVersion || vr.homebridge_version || vr.serverVersion || getFirst(vr, [['raw','version'], ['raw','homebridgeVersion'], ['raw','homebridge_version'], ['raw','serverVersion']]) || null;
		}
		if (typeof vr === 'string') return vr;
		return null;
	})();

	// Fallback: if the dedicated version endpoint didn't return a value, try serverData fields including nested shapes
	const versionFinal =
		versionDisplay || getFirst(serverData, [['homebridgeVersion'], ['serverVersion'], ['nodeVersion'], ['raw','version'], ['raw','nodeVersion']]) || 'N/A';

	const uptimeValue = getFirst(serverData, [['uptime'], ['time','uptime'], ['raw','time','uptime']]);
	const uptimeDisplay = uptimeValue ? formatUptime(uptimeValue) : 'N/A';
	const platformDisplay = getFirst(serverData, [['platform'], ['os','platform'], ['raw','os','platform']]) || 'N/A';
	const serverVersionDisplay = getFirst(serverData, [['serverVersion'], ['raw','serverVersion']]) || 'N/A';

	// Helper to pretty-print server information safely, with uptime formatting
	const renderServerInfo = () => {
		const resp = serverInfoQuery.isSuccess ? serverData : null;
		if (!resp) return 'N/A';
		const data = resp;
		if (!data) return 'N/A';
		if (typeof data === 'string') return data;
		if (typeof data === 'object') {
			const parts: string[] = [];
			const host = getFirst(data, [['hostname'], ['os','hostname'], ['raw','os','hostname']]);
			if (host) parts.push(`host: ${host}`);
			const platform = getFirst(data, [['platform'], ['os','platform'], ['raw','os','platform']]);
			if (platform) parts.push(`platform: ${platform}`);
			const hbVer = getFirst(data, [['homebridgeVersion'], ['raw','homebridgeVersion']]);
			if (hbVer) parts.push(`hb: ${hbVer}`);
			const srvVer = getFirst(data, [['serverVersion'], ['raw','serverVersion'], ['nodeVersion'], ['raw','nodeVersion']]);
			if (srvVer) parts.push(`server: ${srvVer}`);
			const up = getFirst(data, [['uptime'], ['time','uptime'], ['raw','time','uptime']]);
			if (up) parts.push(`uptime: ${formatUptime(up)}`);
			if (parts.length > 0) return parts.join(' · ');
			try {
				const json = JSON.stringify(data);
				return json.length > 200 ? json.slice(0, 197) + '...' : json;
			} catch (e) {
				return 'Unknown';
			}
		}
		return 'N/A';
	};

	return (
		<Card className="w-full">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium flex items-center gap-2">
					<Server className="h-4 w-4" />
					Homebridge
				</CardTitle>
				<ServerStatusBadge status={loading ? 'loading' : isOnline ? 'online' : hasError ? 'error' : 'offline'} />
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 gap-4 text-sm">
					<div className="space-y-1">
						<div className="flex items-center gap-1 text-muted-foreground text-xs">
							<Server className="h-3 w-3" />
							Host
						</div>
						<div className="font-medium">
							{hostHref ? (
								<button
									onClick={() => openHref(buildHref(hostHref, true))}
									className="text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors flex items-center gap-1 mt-1 w-fit"
									title={`Open ${hostValue} in new tab`}
								>
									<span className="truncate">{formatDisplayUrl(hostValue)}</span>
									<ExternalLink className="h-3 w-3" />
								</button>
							) : (
								hostValue || 'Unknown'
							)}
						</div>
						</div>
					</div>

					{(serverInfoQuery.isSuccess || versionQuery.isSuccess) && (
						<div className="space-y-4">
							<div className="flex items-center justify-between text-sm">
								<div className="text-muted-foreground text-xs">Version</div>
								<div className="font-medium">{versionFinal}</div>
							</div>

							<div className="flex items-center justify-between text-sm">
								<div className="text-muted-foreground text-xs">Server</div>
								<div className="font-medium text-right break-words max-w-[45%]">{renderServerInfo()}</div>
							</div>

							<div className="flex items-center justify-between text-sm">
								<div className="text-muted-foreground text-xs">Uptime</div>
								<div className="font-medium">{uptimeDisplay}</div>
							</div>

							<div className="flex items-center justify-between text-sm">
								<div className="text-muted-foreground text-xs">Platform</div>
								<div className="font-medium">{platformDisplay}</div>
							</div>

							<div className="flex items-center justify-between text-sm">
								<div className="text-muted-foreground text-xs">Last seen</div>
								<div className="font-medium">
									{new Date(serverInfoResp?.timestamp || versionResp?.timestamp || Date.now()).toLocaleTimeString()}
								</div>
							</div>
						</div>
					)}

					{!isOnline && !loading && (
						<div className="flex flex-col items-center justify-center py-6 text-center">
							<AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
							<div className="text-sm text-muted-foreground mb-2">
								{hasError ? 'Connection Error' : 'Homebridge is offline'}
							</div>
							{errorMessage && (
								<div className="text-xs text-red-500 max-w-full break-words">{errorMessage}</div>
							)}
						</div>
					)}

					<div className="text-xs text-muted-foreground text-center pt-3 border-t">
						Last updated:{' '}
						{new Date(serverInfoResp?.timestamp || versionResp?.timestamp || Date.now()).toLocaleTimeString()}
					</div>
				</CardContent>
		</Card>
	);
};

export default HomebridgeCard;
