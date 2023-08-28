import { Server } from '@hapi/hapi';
import {
    AddressSpace,
    BindVariableOptionsVariation2,
    CallMethodResultOptions,
    DataType,
    DataValue,
    Namespace,
    OPCUACertificateManager,
    OPCUAServer,
    OPCUAServerOptions,
    SessionContext,
    StatusCodes,
    UAObject,
    UAVariable,
    Variant,
    coerceLocalizedText,
    getHostname,
    makeApplicationUrn
} from 'node-opcua';
import { join as pathJoin } from 'path';
import * as fse from 'fs-extra';
import {
    IOpcAssetInfo,
    IOpcVariable,
    IAssetConfig,
    IAssetTag,
    IMethodConfig,
    IMethodInputArgumentConfig
} from '../models/opcuaServerTypes';
import { PlcController } from './plcController';

const ModuleName = 'RpiPlcOpcuaServer';

export class RpiPlcOpcuaServer {
    private server: Server;
    private serverCertificateManager: OPCUACertificateManager;
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
            const configRoot = pathJoin(this.server.settings.app.rpiPlc.storageRoot, '.config');
            fse.ensureDirSync(configRoot);

            // const pkiRoot = pathJoin(configRoot, 'PKI');

            // this.serverCertificateManager = new OPCUACertificateManager({
            //     automaticallyAcceptUnknownCertificate: true,
            //     rootFolder: pkiRoot
            // });

            // await this.serverCertificateManager.initialize();

            // const opcuaServerOptions = await this.createServerSelfSignedCertificate(pathJoin(pkiRoot, 'certificate.pem'));

            this.opcuaServer = new OPCUAServer({
                ...this.server.settings.app.rpiPlc.serverConfig,
                certificateFile: pathJoin(this.server.settings.app.rpiPlc.storageRoot, 'rpi-plc.crt'),
                privateKeyFile: pathJoin(this.server.settings.app.rpiPlc.storageRoot, 'rpi-plc.key')
            });

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

    // @ts-ignore
    private async createServerSelfSignedCertificate(selfSignedCertificatePath: string): Promise<OPCUAServerOptions> {
        this.server.log([ModuleName, 'info'], `createServerSelfSignedCertificate`);

        const opcuaServerOptions = {
            ...this.server.settings.app.rpiPlc.serverConfig,
            // serverCertificateManager: this.serverCertificateManager,
            certificateFile: selfSignedCertificatePath
        };

        const appName = coerceLocalizedText(opcuaServerOptions.serverInfo.applicationName).text;
        opcuaServerOptions.serverInfo.applicationUri = makeApplicationUrn(getHostname(), appName);

        try {
            if (!fse.pathExistsSync(opcuaServerOptions.certificateFile)) {
                this.server.log([ModuleName, 'info'], `Creating new certificate file:`);

                const certFileRequest = {
                    applicationUri: opcuaServerOptions.serverInfo.applicationUri,
                    dns: [getHostname()],
                    // ip: await getIpAddresses(),
                    outputFile: selfSignedCertificatePath,
                    subject: `/CN=${appName}/O=ScottSHome/L=Medina/C=US`,
                    startDate: new Date(),
                    validity: 365 * 10
                };

                this.server.log([ModuleName, 'info'], `Self-signed certificate file request params:\n${JSON.stringify(certFileRequest, null, 2)}\n`);

                await this.serverCertificateManager.createSelfSignedCertificate(certFileRequest);
            }
            else {
                this.server.log([ModuleName, 'info'], `Using existing certificate file at: ${opcuaServerOptions.certificateFile}`);
            }
        }
        catch (ex) {
            this.server.log([ModuleName, 'error'], `Error creating server self signed certificate: ${ex.message}`);
        }

        return opcuaServerOptions;
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

            const methodConfigs: IMethodConfig[] = this.server.settings.app.rpiPlc.assetRootConfig.methods;

            for (const methodConfig of methodConfigs) {
                const method = this.localServerNamespace.addMethod(this.rootAssetsFolder, {
                    browseName: methodConfig.browseName,
                    displayName: methodConfig.displayName,
                    description: methodConfig.description,
                    inputArguments: methodConfig.inputArguments.map((arg: IMethodInputArgumentConfig) => {
                        return {
                            name: arg.name,
                            description: arg.description,
                            dataType: this.getDataTypeEnumFromString(arg.dataTypeName)
                        };
                    }),
                    outputArguments: methodConfig.outputArguments.map((arg: IMethodInputArgumentConfig) => {
                        return {
                            name: arg.name,
                            description: arg.description,
                            dataType: this.getDataTypeEnumFromString(arg.dataTypeName)
                        };
                    })
                });

                switch (methodConfig.browseName) {
                    case 'controlIndicatorLights':
                        method.bindMethod(this.controlIndicatorLights.bind(this));
                        break;

                    case 'setIndicatorLightMode':
                        method.bindMethod(this.setIndicatorLightMode.bind(this));
                        break;

                    case 'controlDistanceSensor':
                        method.bindMethod(this.controlDistanceSensor.bind(this));
                        break;

                    default:
                        this.server.log([ModuleName, 'warning'], `Unknown method name: ${methodConfig.browseName}`);
                }
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

    private async controlIndicatorLights(inputArguments: Variant[], _context: SessionContext): Promise<CallMethodResultOptions> {
        this.server.log([ModuleName, 'info'], `controlIndicatorLights`);

        const callMethodResult = {
            statusCode: StatusCodes.Good,
            outputArguments: [
                {
                    dataType: DataType.Boolean,
                    value: true
                },
                {
                    dataType: DataType.String,
                    value: 'Success'
                }
            ]
        };

        try {
            await this.plcController.indicatorLightControl({
                ledRedState: inputArguments[0].value,
                ledYellowState: inputArguments[1].value,
                ledGreenState: inputArguments[2].value
            });
        }
        catch (ex) {
            this.server.log([ModuleName, 'error'], `Error in controlIndicatorLights: ${ex.message}`);

            callMethodResult.statusCode = StatusCodes.Bad;
            callMethodResult.outputArguments[0].value = false;
            callMethodResult.outputArguments[1].value = ex.message;
        }

        return callMethodResult;
    }

    private async setIndicatorLightMode(inputArguments: Variant[], _context: SessionContext): Promise<CallMethodResultOptions> {
        this.server.log([ModuleName, 'info'], `setIndicatorLightMode`);

        const callMethodResult = {
            statusCode: StatusCodes.Good,
            outputArguments: [
                {
                    dataType: DataType.Boolean,
                    value: true
                },
                {
                    dataType: DataType.String,
                    value: 'Success'
                }
            ]
        };

        try {
            this.plcController.setIndicatorLightMode(inputArguments[0].value);
        }
        catch (ex) {
            this.server.log([ModuleName, 'error'], `Error in setIndicatorLightMode: ${ex.message}`);

            callMethodResult.statusCode = StatusCodes.Bad;
            callMethodResult.outputArguments[0].value = false;
            callMethodResult.outputArguments[1].value = ex.message;
        }

        return callMethodResult;
    }

    private async controlDistanceSensor(inputArguments: Variant[], _context: SessionContext): Promise<CallMethodResultOptions> {
        this.server.log([ModuleName, 'info'], `controlDistanceSensor`);

        const callMethodResult = {
            statusCode: StatusCodes.Good,
            outputArguments: [
                {
                    dataType: DataType.Boolean,
                    value: true
                },
                {
                    dataType: DataType.String,
                    value: 'Success'
                }
            ]
        };

        try {
            await this.plcController.tfMeasurementControl({
                action: inputArguments[0].value
            });
        }
        catch (ex) {
            this.server.log([ModuleName, 'error'], `Error in controlDistanceSensor: ${ex.message}`);

            callMethodResult.statusCode = StatusCodes.Bad;
            callMethodResult.outputArguments[0].value = false;
            callMethodResult.outputArguments[1].value = ex.message;
        }

        return callMethodResult;
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
