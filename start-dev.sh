#!/bin/bash

# Watchman Development Startup Script
# This script starts both frontend and backend in development mode

echo "🚀 Starting Watchman Dashboard..."
echo ""

# Check if node_modules exists in root
if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
fi

# Check if backend node_modules exists
if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd backend && npm install && cd ..
fi

echo ""
echo "🔧 Starting development servers..."
echo "📱 Frontend: http://localhost:5173"
echo "🔌 Backend API: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Start both frontend and backend concurrently
npm run dev:both