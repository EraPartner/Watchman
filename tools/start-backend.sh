#!/bin/bash

# Start only the backend server
echo "🔌 Starting Watchman Backend..."
echo "API will be available at: http://localhost:3001"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies (npm workspaces)..."
    npm run deps:ci:portable
fi

echo "🚀 Starting backend server..."
npm run dev:backend
