#!/bin/bash

# Production Deployment Script
# This script helps deploy Watchman safely to production

set -e  # Exit on any error

echo "🚀 Starting Watchman Production Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're running as root (not recommended)
if [ "$EUID" -eq 0 ]; then
    print_warning "Running as root is not recommended for security"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
MIN_NODE_VERSION="18.0.0"

if [ "$(printf '%s\n' "$MIN_NODE_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$MIN_NODE_VERSION" ]; then
    print_error "Node.js version $MIN_NODE_VERSION or higher required. Current: $NODE_VERSION"
    exit 1
fi

print_status "Node.js version check passed: $NODE_VERSION"

# Check if environment files exist
if [ ! -f ".env.local" ]; then
    print_error "Frontend .env.local file not found"
    echo "Please copy .env.local.example to .env.local and configure it"
    exit 1
fi

if [ ! -f "backend/.env.local" ]; then
    print_error "Backend .env.local file not found"
    echo "Please copy backend/.env.example to backend/.env.local and configure it"
    exit 1
fi

print_status "Environment files found"

# Validate backend environment
echo "🔍 Validating backend environment..."
cd backend
if npm run validate-env; then
    print_status "Backend environment validation passed"
else
    print_error "Backend environment validation failed"
    exit 1
fi
cd ..

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production
cd backend && npm ci --only=production && cd ..
print_status "Dependencies installed"

# Run security audit
echo "🔒 Running security audit..."
npm audit --audit-level high
if [ $? -ne 0 ]; then
    print_warning "Security vulnerabilities found. Please review and update packages."
    read -p "Continue deployment? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Build frontend
echo "🏗️  Building frontend..."
npm run build
if [ $? -eq 0 ]; then
    print_status "Frontend build completed"
else
    print_error "Frontend build failed"
    exit 1
fi

# Test backend startup
echo "🧪 Testing backend startup..."
cd backend
timeout 30s npm run start &
BACKEND_PID=$!
sleep 10

# Check if backend is responding
if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    print_status "Backend health check passed"
    kill $BACKEND_PID 2>/dev/null || true
else
    print_error "Backend health check failed"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi
cd ..

# Check for production-ready configurations
echo "🔧 Checking production configurations..."

# Check if HTTPS is configured
if grep -q "https://" .env.local; then
    print_status "HTTPS configuration detected"
else
    print_warning "HTTPS not detected in frontend configuration"
fi

if grep -q "https://" backend/.env.local; then
    print_status "Backend HTTPS configuration detected"
else
    print_warning "HTTPS not detected in backend FRONTEND_URL"
fi

# Check for strong JWT secret
JWT_SECRET_LENGTH=$(grep "JWT_SECRET=" backend/.env.local | cut -d'=' -f2 | wc -c)
if [ "$JWT_SECRET_LENGTH" -gt 32 ]; then
    print_status "JWT secret length check passed"
else
    print_warning "JWT secret should be at least 32 characters long"
fi

# Check systemd service file
if [ -f "watchman-backend.service" ]; then
    print_status "Systemd service file found"
    echo "To install: sudo cp watchman-backend.service /etc/systemd/system/"
    echo "Then: sudo systemctl enable watchman-backend"
else
    print_warning "Systemd service file not found"
fi

# Check nginx configuration
if [ -f "nginx-production.conf" ]; then
    print_status "Nginx configuration file found"
    echo "Configure nginx with the provided nginx-production.conf"
else
    print_warning "Nginx configuration file not found"
fi

echo ""
print_status "Production deployment checks completed!"
echo ""
echo "📋 Next steps:"
echo "1. Copy built files to production server"
echo "2. Configure reverse proxy (nginx/Apache)"
echo "3. Set up SSL certificates"
echo "4. Configure systemd service"
echo "5. Set up monitoring and logging"
echo "6. Configure firewall rules"
echo ""
echo "📖 See PRODUCTION-SETUP.md for detailed instructions"