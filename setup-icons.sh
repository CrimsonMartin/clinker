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

# Generate PNG versions at required sizes with rounded corners for logo usage
echo "Generating PNG icons with rounded corners..."

# Function to create rounded corner icons
create_rounded_icon() {
    local size=$1
    local background=$2
    local output=$3
    local radius=$((size / 8))  # Radius is 1/8 of the size for nice proportions
    
    # Create the icon with background
    convert -background "$background" -density 300 icons/icon.svg -resize "${size}x${size}" \
        \( +clone -alpha extract \
           -draw "fill black polygon 0,0 0,$radius $radius,0 \
                  fill white circle $radius,$radius $radius,0" \
           \( +clone -flip \) -compose Multiply -composite \
           \( +clone -flop \) -compose Multiply -composite \
        \) -alpha off -compose CopyOpacity -composite "$output"
}

# Generate active icons with purple background and rounded corners
create_rounded_icon 16 purple icons/icon16.png
create_rounded_icon 48 purple icons/icon48.png  
create_rounded_icon 128 purple icons/icon128.png

# Generate inactive icons with grey background and rounded corners
create_rounded_icon 16 grey icons/icon16-inactive.png
create_rounded_icon 48 grey icons/icon48-inactive.png
create_rounded_icon 128 grey icons/icon128-inactive.png

echo "✅ Icons successfully updated!"
echo "Generated files:"
echo "  - icons/icon.svg"
echo "  - icons/icon16.png"
echo "  - icons/icon48.png"
echo "  - icons/icon128.png"
