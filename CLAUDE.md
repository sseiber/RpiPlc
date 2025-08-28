# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# RpiPlc - Raspberry Pi PLC Service

## Project Overview

RpiPlc is a Node.js/TypeScript-based Programmable Logic Controller (PLC) service designed for Raspberry Pi. It provides GPIO control, serial device communication (TF-Luna distance sensor), and a Fastify-based REST API for industrial automation and IoT applications.

## Architecture Overview

### Core Components

1. **Fastify Server Composition** (`src/composeServer.ts`)
   - Uses Fastify's plugin system with autoloading
   - Registers services before routes to ensure dependency availability
   - Config plugin loads first to provide environment and device configuration
   - Routes are prefixed with `/api/v1`

2. **Hardware Abstraction Layer** (`src/services/plcController.ts`)
   - Singleton controller managing GPIO pins and serial device
   - Uses `node-libgpiod` for GPIO control (BCM2835 chip)
   - Manages TF-Luna sensor via SerialPort with custom parser
   - Implements deferred promise pattern for serial command/response handling
   - Supports multiple indicator light modes (AUTO, GREEN, YELLOWFLASHING, REDFLASHING, MANUAL)

3. **Service Layer** (`src/services/rpiPlc.ts`)
   - Decorated as a Fastify plugin using `fastify-plugin`
   - Provides high-level API for PLC operations
   - Manages observation targets for real-time data streaming

4. **Configuration System** (`src/plugins/config.ts`)
   - Environment-based configuration using `env-schema`
   - Loads `.env` files from `./configs/${NODE_ENV}.env`
   - Reads device configuration from `plcConfig.json`
   - Decorates Fastify instance with config object

## Development Commands

```bash
# Install dependencies
npm install

# Linting
npm run lint

# Build TypeScript
npm run build          # Standard build
npm run build:all      # Force rebuild all

# Build JSON schemas from TypeScript types
npm run build:schemas

# Clean build artifacts
npm run clean          # Clean TypeScript build
npm run clean:all      # Clean all generated files

# Docker operations
npm run dockerbuild    # Build multi-arch Docker image (auto-pushes)
npm run dockerpush     # Note: Multi-arch builds push automatically

# Versioning (triggers docker build/push)
npm version [major|minor|patch]
```

## Key Architectural Patterns

### Plugin Registration Flow
1. Config plugin registers first (provides `server.config`)
2. Services register via autoload (provides `server.rpiPlcService`)
3. Routes register last and use decorated services

### Serial Communication Pattern
- Commands sent to TF-Luna create deferred promises
- Custom parser (`TFLunaResponseParser`) accumulates bytes until valid response
- Response matching based on command prefixes
- Timeout handling for unresponsive device

### GPIO State Management
- Direct pin control via `node-libgpiod` Line objects
- State persistence through indicator light modes
- Automatic mode switches based on TF-Luna measurements

## Configuration

### Environment Variables (required)
- `LOG_LEVEL`: Logging level (default: debug)
- `PORT`: Server port (default: 9092)
- `rpiPlcStorage`: Data storage path (default: /rpi-gd/data)

### Device Configuration (`plcConfig.json`)
```json
{
  "indicatorLightDeviceRed": { "pin": 17, "mode": "Output" },
  "indicatorLightDeviceYellow": { "pin": 27, "mode": "Output" },
  "indicatorLightDeviceGreen": { "pin": 22, "mode": "Output" },
  "tfLunaDevice": {
    "path": "/dev/ttyAMA0",
    "baudRate": 115200,
    "dataBits": 8,
    "stopBits": 1,
    "parity": "none"
  }
}
```

## API Endpoints

- `GET /health` - Health check
- `GET /api/v1/activeObserveTargets` - Get active observation status
- `POST /api/v1/observe` - Start/stop data streaming
  - Body: `{ observeTargets: { measurements: boolean, parserCommandResponse: boolean } }`
- `POST /api/v1/control` - Control GPIO outputs and TF-Luna measurements
  - Actions: INDICATORLIGHT, INDICATORMODE, TFMEASUREMENT, TFCOMMAND

## Hardware Requirements

- Raspberry Pi with GPIO access (BCM2835 chip)
- TF-Luna distance sensor on serial port (typically /dev/ttyAMA0)
- LEDs on GPIO pins 17 (red), 27 (yellow), 22 (green)

## Docker Build System

- Multi-platform builds using buildx (linux/arm64, linux/amd64)
- Two-stage build: Node.js build stage + Alpine runtime
- Automatic push during build for multi-arch images
- Image naming: `{registry}/{project}:{version}-{arch}`

## Important Implementation Details

- ES modules throughout (`"type": "module"`)
- Strict TypeScript with null checks
- JSON schemas auto-generated from TypeScript interfaces
- GPIO requires root or gpio group permissions
- Serial port locks prevent multiple access
- Fastify plugin timeout increased to 60 seconds for hardware initialization

## Deployment

- Kubernetes manifests in `./setup/deployment/`
- Supports both debug service (NodePort) and production service
- Ingress configurations for nginx controller
- Volume mounts for persistent storage at `/rpi-gd/data`