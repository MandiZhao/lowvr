#!/bin/bash
# LowVR - Setup Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=================================="
echo "  LowVR Setup"
echo "=================================="
echo ""

# Check for conda
if ! command -v conda &> /dev/null; then
    echo "Error: conda is required but not found"
    exit 1
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Error: node is required but not found"
    echo "Install Node.js from https://nodejs.org/ or via:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    exit 1
fi

echo "1. Creating conda environment..."
conda env create -f environment.yml -y 2>/dev/null || conda env update -f environment.yml

echo ""
echo "2. Installing frontend dependencies..."
cd frontend
npm install

echo ""
echo "3. Building frontend..."
npm run build

cd "$SCRIPT_DIR"

echo ""
echo "=================================="
echo "  Setup complete!"
echo "=================================="
echo ""
echo "To start the viewer:"
echo "  conda activate lowvr"
echo "  python run.py /path/to/wandb/directory"
echo ""
echo "For remote access, forward the port:"
echo "  ssh -L 8765:localhost:8765 user@server"
echo ""
echo "Then open http://localhost:8765 in your browser"
echo ""
