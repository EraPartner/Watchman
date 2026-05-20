#!/usr/bin/env bash
# /usr/local/sbin/watchman-entrypoint
#
# Runs as root (containerUser=root in devcontainer.json) on every container
# start, BEFORE any dev session. Does all privileged setup here so the
# container can run with --security-opt=no-new-privileges (dev sessions then
# have no path to root — no sudo, no setuid).
#
# Order: fix volume/socket perms -> start the egress proxy -> apply the
# iptables egress lock -> hand off to a keep-alive PID 1.
#
# Everything is best-effort and non-fatal: the container must always reach the
# keep-alive so you can exec in and diagnose even if the network is broken.

set -uo pipefail

log() { echo "[entrypoint] $*"; }

# 1) Repair ownership of named-volume mountpoints + ssh-agent socket.
/usr/local/sbin/watchman-perms-fix || log "WARN: perms-fix returned non-zero."

# 2) Ensure the squid TLS-bump cert + cert DB exist, then start squid.
if [[ ! -f /etc/squid/certs/bump.pem ]]; then
  log "Generating squid bump cert..."
  mkdir -p /etc/squid/certs
  openssl req -new -newkey rsa:2048 -days 3650 -nodes -x509 \
    -subj "/CN=watchman-egress-proxy" \
    -keyout /etc/squid/certs/bump.key -out /etc/squid/certs/bump.crt >/dev/null 2>&1
  cat /etc/squid/certs/bump.key /etc/squid/certs/bump.crt > /etc/squid/certs/bump.pem
fi
if [[ ! -d /var/lib/squid/ssl_db ]]; then
  log "Initializing squid ssl_db..."
  mkdir -p /var/lib/squid
  /usr/lib/squid/security_file_certgen -c -s /var/lib/squid/ssl_db -M 4MB >/dev/null 2>&1 || \
    log "WARN: ssl_db init failed."
fi
mkdir -p /var/log/squid /var/spool/squid
chown -R proxy:proxy /etc/squid/certs /var/lib/squid /var/log/squid /var/spool/squid 2>/dev/null || true

log "Starting egress proxy (squid)..."
squid -N >/var/log/squid/boot.log 2>&1 &
# Wait until squid is listening on 3128 before locking the firewall, so the
# proxy's own UID is established and dev sessions never race an unready proxy.
for _ in $(seq 1 20); do
  if (exec 3<>/dev/tcp/127.0.0.1/3128) 2>/dev/null; then
    log "Proxy listening on 127.0.0.1:3128."
    break
  fi
  sleep 1
done

# Network pre-flight: if Docker Desktop detached us from the bridge (host
# sleep/resume, DD update/reaper), there's no eth0/route and the proxy can't
# resolve anything — every request will fail. Warn with the fix; still apply
# the firewall and keep the container alive so it's diagnosable.
has_iface=0
for iface in /sys/class/net/eth*; do [[ -e "$iface" ]] && has_iface=1; done
default_route=$(awk 'NR>1 && $2=="00000000" {print $1; exit}' /proc/net/route 2>/dev/null)
if (( ! has_iface )) || [[ -z "$default_route" ]]; then
  cat >&2 <<EOF
[entrypoint] ⚠  No external network interface / default route.
[entrypoint]    The proxy won't resolve upstreams until this is fixed.
[entrypoint]    On your HOST shell:  docker network connect bridge $HOSTNAME
[entrypoint]    Then restart the container.
EOF
fi

# 3) Apply the egress firewall (locks outbound to the proxy UID only).
/usr/local/sbin/watchman-firewall || log "WARN: firewall apply returned non-zero."

log "Setup complete. Container ready (dev sessions via 'devcontainer exec')."

# 4) Keep PID 1 alive AND supervise the egress proxy. If squid dies mid-session
#    all egress stops (fail-closed) — restart it so it self-heals. The firewall
#    is independent and stays in force while the proxy is down, so this never
#    opens a gap; it only restores the allowlisted path. Run `doctor` to check.
while true; do
  if ! (exec 3<>/dev/tcp/127.0.0.1/3128) 2>/dev/null; then
    log "egress proxy not responding — restarting squid..."
    squid -N >>/var/log/squid/boot.log 2>&1 &
  fi
  sleep 30
done
