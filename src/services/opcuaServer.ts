import { Server } from '@hapi/hapi';
import {
    AddressSpace,
    BindVariableOptionsVariation2,
    DataType,
    DataValue,
    Namespace,
    OPCUAServer,
    StatusCodes,
    UAObject,
    UAVariable,
    Variant
} from 'node-opcua';
import {
    IOpcAssetInfo,
    IOpcVariable,
    IAssetConfig,
    IAssetTag
} from '../models/opcuaServerTypes';
import { PlcController } from './plcController';

const ModuleName = 'RpiPlcOpcuaServer';

export class RpiPlcOpcuaServer {
    private server: Server;
    private opcuaServer: OPCUAServer;
    private addressSpace: AddressSpace;
    private localServerNamespace: Namespace;
    private rootAssetsFolder: UAObject;
    private opcAssetMap: Map<string, IOpcAssetInfo> = new Map<string, IOpcAssetInfo>();
    private opcVariableMap: Map<string, IOpcVariable> = new Map<string, IOpcVariable>();
    private plcController: PlcController;

    constructor(server: Server, plcController: PlcController) {
        this.server = server;
        this.plcController = plcController;
    }

    public getServer(): OPCUAServer {
        return this.opcuaServer;
    }

    public async start(): Promise<void> {
        this.server.log([ModuleName, 'info'], `Instantiating opcua server`);

        try {
            this.opcuaServer = new OPCUAServer(this.server.settings.app.rpiPlc.serverConfig);

            await this.opcuaServer.initialize();

            await this.constructAddressSpace();

            this.server.log([ModuleName, 'info'], `Starting server...`);
            await this.opcuaServer.start();

            this.server.log([ModuleName, 'info'], `Server started listening on port: ${this.opcuaServer.endpoints[0].port}`);
        }
        catch (ex) {
            this.server.log([ModuleName, 'error'], `Error during server startup: ${ex.message}`);
        }
    }

    public async stop(): Promise<void> {
        await this.opcuaServer.shutdown(10 * 1000);
    }

    public getEndpoint(): string {
        let endpoint = '';

        try {
            endpoint = this.opcuaServer?.endpoints[0]?.endpointDescriptions()[0]?.endpointUrl;
        }
        catch (ex) {
            this.server.log([ModuleName, 'error'], `Error getting server endpoint - may be another running instance at this port: ${this.server.settings.app.rpiPlc.serverConfig?.port}`);
        }

        return endpoint;
    }

    private async constructAddressSpace(): Promise<void> {
        try {
            this.addressSpace = this.opcuaServer.engine.addressSpace;
            this.localServerNamespace = this.addressSpace.getOwnNamespace();

            this.rootAssetsFolder = this.localServerNamespace.addFolder(this.addressSpace.rootFolder.objects, {
                browseName: this.server.settings.app.rpiPlc.assetRootConfig.rootFolderName,
                displayName: this.server.settings.app.rpiPlc.assetRootConfig.rootFolderName
            });

            this.server.log([ModuleName, 'info'], `Processing server configuration...`);
            await this.createAssets();
        }
        catch (ex) {
            this.server.log([ModuleName, 'error'], `Error while constructing server address space: ${ex.message}`);
        }
    }

    private async createAssets(): Promise<void> {
        try {
            const assetConfigs: IAssetConfig[] = this.server.settings.app.rpiPlc.assetRootConfig.assets;

            for (const assetConfig of assetConfigs) {
                const assetVariablesMap: Map<string, IOpcVariable> = new Map<string, IOpcVariable>();

                const opcAsset = this.localServerNamespace.addObject({
                    organizedBy: this.rootAssetsFolder,
                    browseName: assetConfig.name,
                    displayName: assetConfig.name
                });

                for (const tag of assetConfig.tags) {
                    const opcVariable: IOpcVariable = {
                        variable: undefined,
                        sampleInterval: tag.sampleInterval || 0,
                        value: new DataValue({
                            value: new Variant({
                                dataType: tag.dataTypeName,
                                value: tag.value
                            })
                        })
                    };

                    opcVariable.variable = await this.createAssetVariable(opcAsset, tag, opcVariable.value);

                    assetVariablesMap.set(tag.browseName, opcVariable);
                    this.opcVariableMap.set(opcVariable.variable.nodeId.value.toString(), opcVariable);
                }

                const opcAssetInfo: IOpcAssetInfo = {
                    asset: opcAsset,
                    variablesMap: assetVariablesMap
                };

                this.opcAssetMap.set(assetConfig.name, opcAssetInfo);
            }
        }
        catch (ex) {
            this.server.log([ModuleName, 'error'], `Error while processing server configuration (adding variables): ${ex.message}`);
        }
    }

    private async createAssetVariable(asset: UAObject, tag: IAssetTag, dataValue: DataValue): Promise<UAVariable> {
        let uaVariable: UAVariable;

        try {
            uaVariable = this.localServerNamespace.addVariable({
                componentOf: asset,
                browseName: tag.browseName,
                displayName: tag.displayName,
                description: tag.description,
                dataType: tag.dataTypeName,
                minimumSamplingInterval: tag.sampleInterval,
                value: this.createDataAccessor(tag, dataValue)
            });

            this.addressSpace.installHistoricalDataNode(uaVariable);
        }
        catch (ex) {
            this.server.log([ModuleName, 'error'], `Error while adding new UAVariable: ${ex.message}`);
        }

        return uaVariable;
    }

    private createDataAccessor(tag: IAssetTag, dataValue: DataValue): BindVariableOptionsVariation2 {
        return {
            timestamped_get: (): DataValue => {
                const deviceValue = this.plcController.getDeviceValue(tag.browseName);

                dataValue.value.value = deviceValue;
                dataValue.sourceTimestamp = new Date();

                return dataValue;
            },
            timestamped_set: async (newDataValue: DataValue): Promise<StatusCodes> => {
                if (newDataValue.value.dataType !== this.getDataTypeEnumFromString(tag.dataTypeName)) {
                    return StatusCodes.Bad;
                }

                this.plcController.setDeviceValue(tag.browseName, newDataValue.value.value);

                dataValue.value = newDataValue.value;
                dataValue.sourceTimestamp = newDataValue.sourceTimestamp;

                return StatusCodes.Good;
            }
        };
    }

    private getDataTypeEnumFromString(key: string): DataType {
        for (const prop in DataType) {
            if (key === DataType[prop]) {
                return parseInt(prop, 10);
            }
        }

        return 0;
    }
}
