import { ComposeManifest } from 'spryly';
import { IPlcGpioConfig } from './models/rpiPlcTypes';
import { OPCUAServerOptions } from 'node-opcua';
import { IAssetRootConfig } from './models/opcuaServerTypes';

const DefaultPort = 9092;
const PORT = process.env.PORT || process.env.port || process.env.PORT0 || process.env.port0 || DefaultPort;

export function manifest(plcGpioConfigs: IPlcGpioConfig[], serverConfig: OPCUAServerOptions, assetRootConfig: IAssetRootConfig): ComposeManifest {
    return {
        server: {
            port: PORT,
            app: {
                rpiPlc: {
                    plcGpioConfigs,
                    serverConfig,
                    assetRootConfig
                }
            }
        },
        services: [
            './services'
        ],
        plugins: [
            ...[
                {
                    plugin: './apis'
                }
            ]
        ]
    };
}

