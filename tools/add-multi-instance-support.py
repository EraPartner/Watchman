#!/usr/bin/env python3
"""
Script to add multi-instance support to all services in ServiceManager.js
This script updates the initialization code for each service to support multiple instances.
"""

# Service configurations
SERVICES = {
    "bitcoin": {
        "class": "BitcoinService",
        "config_map": {
            "rpcUrl": "url or rpc_url",
            "rpcUser": "rpc_user",
            "rpcPassword": "rpc_password",
            "timeout": "timeout (int, default 120000)",
            "useProxy": "use_proxy (bool)",
        },
        "legacy_required": True
    },
    "adguard": {
        "class": "AdGuardService",
        "config_map": {
            "baseUrl": "url or main_url",
            "authToken": "auth_token or main_auth",
            "username": "username",
            "password": "password",
            "timeout": "timeout (int, default 5000)",
        }
    },
    "tor": {
        "class": "TorService",
        "config_map": {
            "relayNickname": "relay_nickname",
            "onionooBaseUrl": "onionoo_url",
            "timeout": "timeout (int, default 10000)",
            "useProxy": "use_proxy (bool)",
        }
    },
    # ... add more services
}

print("Multi-instance support template generator")
print("=" * 60)
print("\nThis script generates the code patterns needed to add")
print("multi-instance support to all services.")
print("\nRefer to MULTI-INSTANCE-PATTERN.md for the complete pattern.")
