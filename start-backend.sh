#!/bin/bash

# Start only the backend server
echo "🔌 Starting Watchman Backend..."
echo "API will be available at: http://localhost:3001"
echo ""

cd backend

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    npm install
fi

echo "🚀 Starting backend server..."
npm run dev