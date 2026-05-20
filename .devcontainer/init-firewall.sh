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
SENTINEL="/run/watchman-firewall-ok"
# Forwarded host ports (Docker DNAT delivers these to the container).
INBOUND_PORTS=(5173 3001 4173)

# Stale sentinel must never outlive a re-apply: clear it up front so a partial
# failure below can't leave a "verified" marker from a previous run.
rm -f "$SENTINEL" 2>/dev/null || true

# --- FAIL-CLOSED FIRST ---
# Set default-deny BEFORE flushing/adding anything. set -e is intentionally off
# (best-effort apply), so if any rule below fails mid-way the netns is already
# closed and stays closed — never silently fail-open.
iptables  -P INPUT   DROP
iptables  -P OUTPUT  DROP
iptables  -P FORWARD DROP
ip6tables -P INPUT   DROP
ip6tables -P OUTPUT  DROP
ip6tables -P FORWARD DROP

# --- Reset rules (policies set above stay DROP across a flush) ---
iptables -F
iptables -F WATCHMAN_DENY 2>/dev/null || true
iptables -X WATCHMAN_DENY 2>/dev/null || true
iptables -X 2>/dev/null || true
# NOTE: we deliberately do NOT flush the NAT table. We add no NAT rules of our
# own, and on plain Docker/bridge networking the embedded DNS (127.0.0.11) is
# NAT-based — flushing it would break name resolution. Leaving NAT untouched
# keeps this portable beyond Docker Desktop.
ip6tables -F
ip6tables -X 2>/dev/null || true

# --- IPv6: loopback only (everything else stays default-DROP) ---
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

# --- Verify the lock actually took, then drop the sentinel ---
# post-start.sh refuses to proceed if the sentinel is missing, and the
# Dockerfile HEALTHCHECK independently re-checks the default policy.
if iptables -S OUTPUT 2>/dev/null | grep -q '^-P OUTPUT DROP' \
   && iptables -C OUTPUT -m owner --uid-owner "$PROXY_USER" -j ACCEPT 2>/dev/null; then
  : > "$SENTINEL" 2>/dev/null || true
  echo "[firewall] Egress locked to proxy UID '$PROXY_USER' (IPv4 + IPv6 default-deny, verified)."
else
  rm -f "$SENTINEL" 2>/dev/null || true
  echo "[firewall] ERROR: egress-lock verification FAILED — egress stays default-DROP (fail-closed)." >&2
  exit 1
fi
