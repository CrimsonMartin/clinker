#!/bin/bash

# Setup script to replace icons with lucide-static link icon
# This script copies the link icon from lucide-static and generates PNG versions

set -e  # Exit on any error

echo "Setting up icons from lucide-static..."

# Check if lucide-static is installed
if [ ! -d "node_modules/lucide-static" ]; then
    echo "Error: lucide-static not found. Please run 'npm install' first."
    exit 1
fi

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo "ImageMagick not found. Installing..."
    sudo apt update && sudo apt install -y imagemagick
fi

# Create icons directory if it doesn't exist
mkdir -p icons

# Copy the lucide-static link icon and fix the color
echo "Copying link icon from lucide-static..."
cp node_modules/lucide-static/icons/link.svg icons/icon.svg

# Fix the SVG to use black color instead of currentColor
echo "Fixing SVG color..."
sed -i 's/stroke="currentColor"/stroke="#000000"/g' icons/icon.svg

# Generate PNG versions at required sizes with transparent background
echo "Generating PNG icons with transparent background..."
convert -background purple -density 300 icons/icon.svg -resize 16x16 icons/icon16.png
convert -background purple -density 300 icons/icon.svg -resize 48x48 icons/icon48.png
convert -background purple -density 300 icons/icon.svg -resize 128x128 icons/icon128.png

convert -background grey -density 300 icons/icon.svg -resize 16x16 icons/icon16-inactive.png
convert -background grey -density 300 icons/icon.svg -resize 48x48 icons/icon48-inactive.png
convert -background grey -density 300 icons/icon.svg -resize 128x128 icons/icon128-inactive.png

echo "✅ Icons successfully updated!"
echo "Generated files:"
echo "  - icons/icon.svg"
echo "  - icons/icon16.png"
echo "  - icons/icon48.png"
echo "  - icons/icon128.png"
