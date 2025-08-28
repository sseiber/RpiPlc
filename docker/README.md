# Docker Build for Raspberry Pi 4

This directory contains Docker configurations optimized for Raspberry Pi 4 (ARM64/amd64v8 architecture).

## Prerequisites

- Docker installed on your build machine
- Docker Buildx (for cross-platform builds if not on ARM64)
- Access to Raspberry Pi GPIO (when running)

## Build Files

- `Dockerfile.rpi4` - Multi-stage Dockerfile optimized for Raspberry Pi 4
- `docker-compose.yml` - Docker Compose configuration for easy deployment

## Building the Image

### On Raspberry Pi 4 (Native ARM64)

```bash
# Using the build script
./.scripts/dockerBuildRpi4.sh

# Or manually
docker build -f docker/Dockerfile.rpi4 -t rpi-plc:latest .
```

### On x86_64 (Cross-compilation)

The build script automatically detects the architecture and uses Docker buildx:

```bash
# Build for ARM64
./.scripts/dockerBuildRpi4.sh

# Build and push to registry
DOCKER_REGISTRY=myregistry.com ./.scripts/dockerBuildRpi4.sh --push
```

### Using Docker Compose

```bash
# Build and run
docker-compose up --build

# Run in background
docker-compose up -d
```

## Key Features

### Multi-stage Build
1. **Build Stage** (`buildstage`)
   - Uses `arm64v8/node:20-bookworm` with full build tools
   - Installs node-gyp dependencies
   - Compiles TypeScript and native modules
   - Runs linting and validation

2. **Runtime Stage** (`runtime`)
   - Uses `arm64v8/node:20-bookworm-slim` for smaller size
   - Only includes runtime dependencies
   - Runs as non-root user `plcuser`
   - Includes health check

### GPIO Support
- Installs `libgpiod2` and `libgpiod-dev` for node-libgpiod
- User added to `gpio` group for hardware access
- Container requires privileged mode or specific device access

### Security
- Non-root user execution
- Minimal runtime dependencies
- Read-only config mount recommended

## Running the Container

### Direct Docker Run

```bash
docker run --privileged \
  --device /dev/gpiochip0:/dev/gpiochip0 \
  --device /dev/ttyAMA0:/dev/ttyAMA0 \
  -p 9092:9092 \
  -v $(pwd)/configs:/app/configs:ro \
  -v plc-data:/rpi-gd/data \
  -e NODE_ENV=production \
  rpi-plc:latest
```

### Using Docker Compose

```bash
docker-compose up
```

## Environment Variables

- `NODE_ENV` - Node environment (development/production)
- `LOG_LEVEL` - Logging level (debug/info/warn/error)
- `PORT` - Application port (default: 9092)
- `rpiPlcStorage` - Data storage path (default: /rpi-gd/data)

## Volumes

- `/app/configs` - Application configuration files (read-only recommended)
- `/rpi-gd/data` - Persistent data storage

## Ports

- `9092` - Main application HTTP API
- `4334` - Additional service port

## Troubleshooting

### GPIO Access Denied
Ensure the container runs with `--privileged` flag or proper device mappings.

### Serial Port Issues
Check that `/dev/ttyAMA0` is available and not used by other services.

### Build Failures
- Ensure Docker buildx is installed for cross-platform builds
- Check network connectivity for package downloads
- Verify sufficient disk space for build

## Image Size

Typical image sizes:
- Build stage: ~1.2GB
- Runtime stage: ~250MB

The multi-stage build significantly reduces the final image size by excluding build tools.