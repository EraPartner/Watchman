#!/bin/bash

# Start only the frontend
echo "📱 Starting Watchman Frontend..."
echo "Dashboard will be available at: http://localhost:5173"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies (npm workspaces)..."
    npm install
fi

echo "🚀 Starting frontend development server..."
npm run dev:frontend