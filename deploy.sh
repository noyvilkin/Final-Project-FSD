#!/bin/bash

# CareerPilot Deployment Script
# This script automates the deployment process for the CareerPilot application

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=================================="
echo "CareerPilot Deployment Script"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check if running from correct directory
if [ ! -f "package.json" ] && [ ! -d "backend" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Step 1: Pull latest changes
echo "Step 1: Pulling latest changes from repository..."
if git pull origin main; then
    print_success "Git pull completed"
else
    print_error "Git pull failed"
    exit 1
fi

# Step 2: Install frontend dependencies
echo ""
echo "Step 2: Installing frontend dependencies..."
cd frontend
if npm install; then
    print_success "Frontend dependencies installed"
else
    print_error "Frontend dependency installation failed"
    exit 1
fi

# Step 3: Build frontend (static assets served by backend in production)
echo ""
echo "Step 3: Building frontend..."
if npm run build; then
    print_success "Frontend build completed (output: frontend/dist/)"
else
    print_error "Frontend build failed"
    exit 1
fi

cd ..

# Step 4: Install backend dependencies
echo ""
echo "Step 4: Installing backend dependencies..."
cd backend
if npm install; then
    print_success "Backend dependencies installed"
else
    print_error "Backend dependency installation failed"
    exit 1
fi

# Step 5: Build backend
echo ""
echo "Step 5: Building backend..."
if npm run build; then
    print_success "Backend build completed"
else
    print_error "Backend build failed"
    exit 1
fi

# Step 6: Restart backend with PM2 in production mode
echo ""
echo "Step 6: Restarting backend application with PM2 (production)..."
if pm2 restart careerpilot-backend --update-env 2>/dev/null; then
    print_success "Backend application restarted"
else
    print_warning "Backend not running, starting new instance..."
    if NODE_ENV=production pm2 start npm --name "careerpilot-backend" -- run start; then
        print_success "Backend application started"
    else
        print_error "Failed to start backend application"
        exit 1
    fi
fi

cd ..

# Final status check
echo ""
echo "=================================="
echo "Deployment Summary"
echo "=================================="
pm2 list
echo ""
print_success "Deployment completed successfully!"
echo ""
echo "Useful commands:"
echo "  - View logs: pm2 logs careerpilot-backend"
echo "  - Stop app: pm2 stop careerpilot-backend"
echo "  - Restart app: pm2 restart careerpilot-backend --update-env"
echo "  - App status: pm2 status"
echo ""