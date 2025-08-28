#!/bin/bash

# Docker build script for Raspberry Pi 4 (ARM64/amd64v8)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOCKERFILE="docker/Dockerfile.rpi4"
IMAGE_NAME="rpi-plc"
REGISTRY=${DOCKER_REGISTRY:-""}
VERSION=$(node -p "require('./package.json').version")
PLATFORM="linux/arm64/v8"

# Function to print colored output
log() {
    echo -e "${GREEN}[BUILD]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check if running on ARM64 or if we need to use buildx
ARCH=$(uname -m)
USE_BUILDX=false

if [ "$ARCH" != "aarch64" ]; then
    log "Host architecture is $ARCH, will use Docker buildx for cross-compilation"
    USE_BUILDX=true
    
    # Check if buildx is available
    if ! docker buildx version &> /dev/null; then
        error "Docker buildx is required for cross-platform builds"
        exit 1
    fi
    
    # Create or use existing buildx builder
    BUILDER_NAME="rpi-plc-builder"
    if ! docker buildx ls | grep -q $BUILDER_NAME; then
        log "Creating buildx builder: $BUILDER_NAME"
        docker buildx create --name $BUILDER_NAME --platform $PLATFORM --use
    else
        log "Using existing buildx builder: $BUILDER_NAME"
        docker buildx use $BUILDER_NAME
    fi
fi

# Construct image tag
if [ -n "$REGISTRY" ]; then
    FULL_IMAGE_NAME="$REGISTRY/$IMAGE_NAME:$VERSION-arm64v8"
else
    FULL_IMAGE_NAME="$IMAGE_NAME:$VERSION-arm64v8"
fi

log "Building Docker image: $FULL_IMAGE_NAME"
log "Platform: $PLATFORM"
log "Dockerfile: $DOCKERFILE"

# Build command
if [ "$USE_BUILDX" = true ]; then
    # Cross-platform build with buildx
    BUILD_CMD="docker buildx build"
    BUILD_ARGS="--platform $PLATFORM --load"
else
    # Native ARM64 build
    BUILD_CMD="docker build"
    BUILD_ARGS=""
fi

# Execute build
$BUILD_CMD \
    $BUILD_ARGS \
    --file $DOCKERFILE \
    --tag $FULL_IMAGE_NAME \
    --tag ${FULL_IMAGE_NAME%-arm64v8}-latest-arm64v8 \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    --progress=plain \
    .

if [ $? -eq 0 ]; then
    log "Build successful!"
    log "Image tagged as:"
    log "  - $FULL_IMAGE_NAME"
    log "  - ${FULL_IMAGE_NAME%-arm64v8}-latest-arm64v8"
    
    # Optional: Push to registry
    if [ "$1" == "--push" ] && [ -n "$REGISTRY" ]; then
        log "Pushing image to registry..."
        if [ "$USE_BUILDX" = true ]; then
            # Rebuild and push in one step for buildx
            $BUILD_CMD \
                --platform $PLATFORM \
                --push \
                --file $DOCKERFILE \
                --tag $FULL_IMAGE_NAME \
                --tag ${FULL_IMAGE_NAME%-arm64v8}-latest-arm64v8 \
                .
        else
            docker push $FULL_IMAGE_NAME
            docker push ${FULL_IMAGE_NAME%-arm64v8}-latest-arm64v8
        fi
        log "Push complete!"
    fi
else
    error "Build failed!"
    exit 1
fi

# Print image info
echo ""
log "Image information:"
docker images | grep -E "REPOSITORY|$IMAGE_NAME" | head -5

# If on Raspberry Pi, show how to run
if [ "$ARCH" == "aarch64" ]; then
    echo ""
    log "To run the container on Raspberry Pi 4:"
    echo "docker run --privileged \\"
    echo "  --device /dev/gpiochip0:/dev/gpiochip0 \\"
    echo "  --device /dev/ttyAMA0:/dev/ttyAMA0 \\"
    echo "  -p 9092:9092 \\"
    echo "  -v \$(pwd)/configs:/app/configs:ro \\"
    echo "  -v plc-data:/rpi-gd/data \\"
    echo "  $FULL_IMAGE_NAME"
fi