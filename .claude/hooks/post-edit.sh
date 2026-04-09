#!/usr/bin/env bash
# PostToolUse hook — fires after Edit or Write
# Receives tool event as JSON on stdin

set -euo pipefail
PROJECT="/Users/computer/Documents/Personal/Scripts/Projects/Watchman"

# Parse file_path from stdin JSON
FILE=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null || echo "")

[ -z "$FILE" ] && exit 0

# TypeScript/TSX: ESLint on the changed file only
# Run from the workspace directory so ESLint can locate eslint.config.js
if [[ "$FILE" == *.ts || "$FILE" == *.tsx ]]; then
  if [[ "$FILE" == "$PROJECT/apps/frontend/"* ]]; then
    ESLINT_CWD="$PROJECT/apps/frontend"
  elif [[ "$FILE" == "$PROJECT/apps/backend/"* ]]; then
    ESLINT_CWD="$PROJECT/apps/backend"
  else
    ESLINT_CWD="$PROJECT"
  fi
  echo "--- ESLint: $(basename "$FILE") ---"
  cd "$ESLINT_CWD"
  npx eslint "$FILE" --quiet --max-warnings=0 2>&1
fi
