#!/bin/bash

# Script to delete 'dist' folders and 'tsconfig.tsbuildinfo' files recursively
# Excludes node_modules directories

set -e # Exit on any error

echo "Cleaning build artifacts..."
echo "Starting directory: $(pwd)"
echo

# Count items before deletion for reporting
dist_count=$(find . -name "dist" -type d -not -path "*/node_modules/*" | wc -l)
tsconfig_count=$(find . -name "tsconfig.tsbuildinfo" -type f -not -path "*/node_modules/*" | wc -l)

echo "Found:"
echo "  - $dist_count 'dist' folders"
echo "  - $tsconfig_count 'tsconfig.tsbuildinfo' files"
echo

# Ask for confirmation
read -p "Do you want to proceed with deletion? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Operation cancelled."
    exit 0
fi

echo "Deleting 'dist' folders..."
# Find and delete all 'dist' directories, excluding those in node_modules
find . -name "dist" -type d -not -path "*/node_modules/*" -print0 | while IFS= read -r -d '' dir; do
    echo "Removing directory: $dir"
    rm -rf "$dir"
done

echo "Deleting 'tsconfig.tsbuildinfo' files..."
# Find and delete all 'tsconfig.tsbuildinfo' files, excluding those in node_modules
find . -name "tsconfig.tsbuildinfo" -type f -not -path "*/node_modules/*" -print0 | while IFS= read -r -d '' file; do
    echo "Removing file: $file"
    rm -f "$file"
done

echo
echo "Cleanup completed successfully!"

# Verify cleanup
remaining_dist=$(find . -name "dist" -type d -not -path "*/node_modules/*" | wc -l)
remaining_tsconfig=$(find . -name "tsconfig.tsbuildinfo" -type f -not -path "*/node_modules/*" | wc -l)

if [[ $remaining_dist -eq 0 && $remaining_tsconfig -eq 0 ]]; then
    echo "All target files and folders have been removed."
else
    echo "Warning: Some items may still remain:"
    echo "  - $remaining_dist 'dist' folders"
    echo "  - $remaining_tsconfig 'tsconfig.tsbuildinfo' files"
fi
