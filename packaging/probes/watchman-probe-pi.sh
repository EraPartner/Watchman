#!/bin/sh
# Watchman read-only probe for a Raspberry Pi.
#
# sshd runs this script for every connection made with the Watchman key,
# whatever command the client asks for, so that key can only read the values
# below. Install it root-owned and not writable by the monitoring user:
#
#   sudo install -o root -g root -m 755 watchman-probe-pi.sh /usr/local/bin/watchman-probe
#
# and prefix the key in /home/watchman/.ssh/authorized_keys:
#
#   restrict,command="/usr/local/bin/watchman-probe",from="<watchman-ip>" ssh-ed25519 AAAA... watchman
#
# Generated from apps/backend/src/domain/services/raspberryPi/PiStatsCollector.ts
# (PI_DYNAMIC_COMMANDS then PI_STATIC_COMMANDS); apps/backend/src/infra/ssh/probeScripts.test.ts fails when the
# two drift apart. Do not edit the command lines by hand.
#
# --- commands ---
( vcgencmd measure_temp ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( vcgencmd measure_clock arm ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( vcgencmd measure_volts core ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( vcgencmd get_throttled ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( cat /proc/loadavg ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( cat /proc/meminfo ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( cat /proc/uptime ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( head -n 1 /proc/stat ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( df -kP / ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( findmnt -no OPTIONS / ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( systemctl --failed --no-legend --plain && echo __watchman_systemctl_ok__ ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( cat /proc/net/dev ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( cat /proc/cpuinfo ) 2>/dev/null || true; echo "@@WATCHMAN_SEGMENT@@";
( cat /etc/os-release ) 2>/dev/null || true
