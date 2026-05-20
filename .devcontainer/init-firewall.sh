#!/usr/bin/env bash
# Watchman devcontainer egress firewall — proxy-only model.
#
# Baked into the image at /usr/local/sbin/watchman-firewall; invoked by the
# root entrypoint on every container start. The repo copy at
# .devcontainer/init-firewall.sh is the source — edits require a rebuild.
#
# Egress is locked to the squid proxy's UID only. Everything else in the
# container (dev sessions, npm postinstalls, …) must go through the proxy on
# 127.0.0.1:3128, where squid enforces the hostname allowlist (see squid.conf).
# A process that ignores HTTPS_PROXY and tries to connect directly is dropped
# here, because its socket UID is not `proxy`.
#
# This replaces the older IP-allowlist/ipset approach: hostname enforcement
# now lives in the proxy, so there is no DNS-resolution dance and no stale-IP
# problem. iptables just answers "who is allowed to egress at all" (= proxy).

set -uo pipefail

PROXY_USER="proxy"
# Forwarded host ports (Docker DNAT delivers these to the container).
INBOUND_PORTS=(5173 3001 4173)

# --- IPv4 reset ---
iptables -F
iptables -F WATCHMAN_DENY 2>/dev/null || true
iptables -X WATCHMAN_DENY 2>/dev/null || true
iptables -X 2>/dev/null || true
# NOTE: flushing the NAT table is safe on Docker Desktop (DNS resolver is a
# real host at resolv.conf's nameserver). On plain Docker/bridge networking the
# embedded DNS at 127.0.0.11 is NAT-based, so flushing -t nat there would break
# name resolution — this devcontainer targets Docker Desktop/macOS (see README).
iptables -t nat -F
iptables -t nat -X 2>/dev/null || true

# --- IPv6: default-deny everything except loopback ---
ip6tables -F
ip6tables -X 2>/dev/null || true
ip6tables -P INPUT   DROP
ip6tables -P FORWARD DROP
ip6tables -P OUTPUT  DROP
ip6tables -A INPUT  -i lo -j ACCEPT
ip6tables -A OUTPUT -o lo -j ACCEPT

# --- IPv4 base allows ---
iptables -A INPUT  -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A INPUT  -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Only the proxy UID may originate outbound traffic (DNS, 80, 443, …).
# Everything else must use the proxy over loopback.
iptables -A OUTPUT -m owner --uid-owner "$PROXY_USER" -j ACCEPT

# Inbound on forwarded ports (host browser → frontend/backend).
for p in "${INBOUND_PORTS[@]}"; do
  iptables -A INPUT -p tcp --dport "$p" -j ACCEPT
done

# Logged-DROP for everything else, rate-limited so a loop can't flood dmesg.
# Visible via `dmesg | grep watchman-deny`.
iptables -N WATCHMAN_DENY
iptables -A WATCHMAN_DENY -m limit --limit 10/min -j LOG --log-prefix "watchman-deny: " --log-level 4
iptables -A WATCHMAN_DENY -j DROP
iptables -A OUTPUT -j WATCHMAN_DENY

# Default policies — deny what isn't explicitly allowed above.
iptables -P INPUT   DROP
iptables -P FORWARD DROP
iptables -P OUTPUT  DROP

echo "[firewall] Egress locked to proxy UID '$PROXY_USER' (IPv4 + IPv6 default-deny)."
