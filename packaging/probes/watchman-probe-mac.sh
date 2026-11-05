#!/bin/sh
# Watchman read-only probe for a Mac (macOS).
#
# sshd runs this script for every connection made with the Watchman key,
# whatever command the client asks for, so that key can only read the values
# below. Install it root-owned and not writable by the monitoring user:
#
#   sudo install -o root -g wheel -m 755 watchman-probe-mac.sh /usr/local/bin/watchman-probe
#
# and prefix the key in /Users/watchman/.ssh/authorized_keys:
#
#   restrict,command="/usr/local/bin/watchman-probe",from="<watchman-ip>" ssh-ed25519 AAAA... watchman
#
# Generated from apps/backend/src/domain/services/macMini/MacMiniService.ts
# (MAC_STATS_COMMANDS); apps/backend/src/infra/ssh/probeScripts.test.ts fails when the
# two drift apart. Do not edit the command lines by hand.
#
# --- commands ---
( uptime ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( df -k /System/Volumes/Data 2>/dev/null || df -k / ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"; if which smctemp >/dev/null 2>&1; then smctemp -c; elif which osx-cpu-temp >/dev/null 2>&1; then osx-cpu-temp; fi ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( vm_stat ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( pmset -g batt ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( top -l 2 -n 0 -s 1 ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( ifconfig en0 ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"; which smartctl >/dev/null 2>&1 && smartctl -j -a disk0 2>/dev/null || true ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( sysctl -n kern.memorystatus_level ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( sysctl -n vm.swapusage ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( pmset -g therm ) 2>/dev/null || true
