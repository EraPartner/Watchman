#!/usr/bin/env python3
import re

# Read the file
with open('services/ServiceManager.js', 'r') as f:
    content = f.read()

# Services that need serviceInstances.set added (line numbers where this.services.set appears)
services_to_add = [
    ('tor', 107),
    ('qbittorrent', 117),
    ('ipfs', 138),
    ('roon', 151),
    ('philips', 166),
    ('homebridge', 196),
    ('macmini', 231),
    ('albyhub', 244)
]

# Split into lines
lines = content.split('\n')

# Add serviceInstances.set after each service.set for these services
for service_name, line_num in reversed(services_to_add):
    # Insert after the this.services.set line (line_num is 1-based, adjust to 0-based)
    insertion_line = line_num - 1
    # Check if serviceInstances already exists on next line
    if insertion_line + 1 < len(lines) and 'serviceInstances' not in lines[insertion_line + 1]:
        lines.insert(insertion_line + 1, f'        this.serviceInstances.set("{service_name}", ["{service_name}"]);')

# Write back
with open('services/ServiceManager.js', 'w') as f:
    f.write('\n'.join(lines))

print("✅ Added serviceInstances.set for all services")
