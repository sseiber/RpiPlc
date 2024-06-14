import { FastifyInstance } from 'fastify';
import {
    AddressSpace,
    BindVariableOptionsVariation2,
    CallMethodResultOptions,
    DataType,
    DataValue,
    Namespace,
    // OPCUACertificateManager,
    OPCUAServer,
    SessionContext,
    StatusCodes,
    UAEventType,
    UAObject,
    UAString,
    UAVariable,
    Variant
} from 'node-opcua';
import { join as pathJoin } from 'path';
import * as fse from 'fs-extra';
import {
    IOpcAssetInfo,
    IOpcVariable,
    IAssetConfig,
    IAssetNode,
    IMethodConfig,
    IMethodInputArgumentConfig
} from '../models/opcuaServerTypes';
import { PlcController } from './plcController';
import { IndicatorLightMode } from '../models/rpiPlcTypes';

const ModuleName = 'rpiPlcOpcuaServer';

export class RpiPlcOpcuaServer {
    private server: FastifyInstance;
    // private serverCertificateManager: OPCUACertificateManager;
    private opcuaServer: OPCUAServer;
    private addressSpace: AddressSpace;
    private localServerNamespace: Namespace;
    private customLocationRoot: UAObject;
    private assetsRoot: UAObject;
    private eventTFLunaStartMeasurement: UAEventType;
    private eventTFLunaStopMeasurement: UAEventType;
    private opcAssetMap: Map<string, IOpcAssetInfo> = new Map<string, IOpcAssetInfo>();
    private opcVariableMap: Map<string, IOpcVariable> = new Map<string, IOpcVariable>();
    private plcController: PlcController;

    constructor(server: FastifyInstance, plcController: PlcController) {
        this.server = server;
        this.plcController = plcController;
    }

    public getServer(): OPCUAServer {
        return this.opcuaServer;
    }

    public async start(): Promise<void> {
        this.server.log.info({ tags: [ModuleName] }, `Initializing OPCUA server`);

        try {
            const configRoot = pathJoin(this.server.rootConfig.storageRoot, '.config');
            fse.ensureDirSync(configRoot);

            // const pkiRoot = pathJoin(configRoot, 'PKI');

            // this.serverCertificateManager = new OPCUACertificateManager({
            //     automaticallyAcceptUnknownCertificate: true,
            //     rootFolder: pkiRoot
            // });

            // await this.serverCertificateManager.initialize();

            // const opcuaServerOptions = await this.createServerSelfSignedCertificate(pathJoin(pkiRoot, 'certificate.pem'));

            this.opcuaServer = new OPCUAServer({
                ...this.server.rootConfig.opcuaServerOptions
                // certificateFile: pathJoin(this.server.rootConfig.storageRoot, 'rpi-plc.crt'), // use built-in auto-created cert functionality
                // privateKeyFile: pathJoin(this.server.rootConfig.storageRoot, 'rpi-plc.key')
            });

            await this.opcuaServer.initialize();

            this.constructAddressSpace();

            this.server.log.info({ tags: [ModuleName] }, `Starting OPCUA server...`);
            await this.opcuaServer.start();

            this.server.log.info({ tags: [ModuleName] }, `OPCUA server started listening on port: ${this.opcuaServer.endpoints[0].port}`);
        }
        catch (ex) {
            this.server.log.error({ tags: [ModuleName] }, `Error during OPCUA server startup: ${ex.message}`);
        }
    }

    public async stop(): Promise<void> {
        await this.opcuaServer.shutdown(10 * 1000);
    }

    public getEndpoint(): string {
        let endpoint: UAString = '';

        try {
            endpoint = this.opcuaServer?.endpoints[0]?.endpointDescriptions()[0]?.endpointUrl;
        }
        catch (ex) {
            this.server.log.error({ tags: [ModuleName] }, `Error getting server endpoint - may be another running instance at this port: ${this.server.rootConfig.opcuaServerOptions?.port}, ${ex.message}`);
        }

        return endpoint ?? '';
    }

    // private async createServerSelfSignedCertificate(selfSignedCertificatePath: string): Promise<OPCUAServerOptions> {
    //     this.server.log.info({ tags: [ModuleName] }, `createServerSelfSignedCertificate`);

    //     const opcuaServerOptions = {
    //         ...this.server.settings.app.rpiPlc.serverConfig,
    //         // serverCertificateManager: this.serverCertificateManager,
    //         certificateFile: selfSignedCertificatePath
    //     };

    //     const appName = coerceLocalizedText(opcuaServerOptions.serverInfo.applicationName).text;
    //     opcuaServerOptions.serverInfo.applicationUri = makeApplicationUrn(getHostname(), appName);

    //     try {
    //         if (!fse.pathExistsSync(opcuaServerOptions.certificateFile)) {
    //             this.server.log.info({ tags: [ModuleName] }, `Creating new certificate file:`);

    //             const certFileRequest = {
    //                 applicationUri: opcuaServerOptions.serverInfo.applicationUri,
    //                 dns: [getHostname()],
    //                 // ip: await getIpAddresses(),
    //                 outputFile: selfSignedCertificatePath,
    //                 subject: `/CN=${appName}/O=ScottSHome/L=Medina/C=US`,
    //                 startDate: new Date(),
    //                 validity: 365 * 10
    //             };

    //             this.server.log.info({ tags: [ModuleName] }, `Self-signed certificate file request params:\n${JSON.stringify(certFileRequest, null, 2)}\n`);

    //             await this.serverCertificateManager.createSelfSignedCertificate(certFileRequest);
    //         }
    //         else {
    //             this.server.log.info({ tags: [ModuleName] }, `Using existing certificate file at: ${opcuaServerOptions.certificateFile}`);
    //         }
    //     }
    //     catch (ex) {
    //         this.server.log.error({ tags: [ModuleName] }, `Error creating server self signed certificate: ${ex.message}`);
    //     }

    //     return opcuaServerOptions;
    // }

    private constructAddressSpace(): void {
        try {
            if (!this.opcuaServer.engine.addressSpace) {
                throw new Error('The OPCUA server engine address space is not configured');
            }

            this.addressSpace = this.opcuaServer.engine.addressSpace;
            this.localServerNamespace = this.addressSpace.getOwnNamespace();

            this.eventTFLunaStartMeasurement = this.localServerNamespace.addEventType({
                browseName: 'Event_TFLunaStartMeasurement'
            });

            this.eventTFLunaStopMeasurement = this.localServerNamespace.addEventType({
                browseName: 'Event_TFLunaStopMeasurement'
            });

            this.customLocationRoot = this.localServerNamespace.addObject({
                browseName: 'ScottSHome',
                displayName: 'ScottSHome',
                organizedBy: this.addressSpace.rootFolder.objects,
                notifierOf: this.addressSpace.rootFolder.objects.server
            });

            this.assetsRoot = this.localServerNamespace.addObject({
                browseName: this.server.rootConfig.assetRootConfig.rootFolderName,
                displayName: this.server.rootConfig.assetRootConfig.rootFolderName,
                componentOf: this.customLocationRoot,
                notifierOf: this.customLocationRoot
            });

            this.server.log.info({ tags: [ModuleName] }, `Processing server configuration...`);
            this.createAssets();
        }
        catch (ex) {
            this.server.log.error({ tags: [ModuleName] }, `Error while constructing server address space: ${ex.message}`);
        }
    }

    private createAssets(): void {
        try {
            const assetConfigs: IAssetConfig[] = this.server.rootConfig.assetRootConfig.assets;

            for (const assetConfig of assetConfigs) {
                const assetVariablesMap: Map<string, IOpcVariable> = new Map<string, IOpcVariable>();

                const opcAsset = this.localServerNamespace.addObject({
                    browseName: assetConfig.name,
                    displayName: assetConfig.name,
                    componentOf: this.assetsRoot,
                    eventSourceOf: this.assetsRoot,
                    eventNotifier: 1
                });

                for (const assetNode of assetConfig.nodes) {
                    const dataValue = new DataValue({
                        value: new Variant({
                            dataType: assetNode.dataTypeName,
                            value: assetNode.value
                        })
                    });
                    const uaVariable = this.createAssetVariable(opcAsset, assetNode, dataValue);

                    if (!uaVariable) {
                        this.server.log.error({ tags: [ModuleName] }, `Error creating UAVariable: ${assetNode.browseName}`);
                        continue;
                    }

                    const opcVariable: IOpcVariable = {
                        variable: uaVariable,
                        sampleInterval: assetNode.sampleInterval || 0,
                        value: dataValue
                    };

                    assetVariablesMap.set(assetNode.browseName, opcVariable);
                    this.opcVariableMap.set(opcVariable.variable.nodeId.value.toString(), opcVariable);
                }

                const opcAssetInfo: IOpcAssetInfo = {
                    asset: opcAsset,
                    variablesMap: assetVariablesMap
                };

                this.opcAssetMap.set(assetConfig.name, opcAssetInfo);
            }

            const methodConfigs: IMethodConfig[] = this.server.rootConfig.assetRootConfig.methods;

            for (const methodConfig of methodConfigs) {
                const method = this.localServerNamespace.addMethod(this.assetsRoot, {
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

                /* eslint-disable @typescript-eslint/no-unsafe-argument */
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
                        this.server.log.warn({ tags: [ModuleName] }, `Unknown method name: ${methodConfig.browseName}`);
                }
                /* eslint-enable @typescript-eslint/no-unsafe-argument */
            }
        }
        catch (ex) {
            this.server.log.error({ tags: [ModuleName] }, `Error while processing server configuration (adding variables): ${ex.message}`);
        }
    }

    private createAssetVariable(asset: UAObject, assetNode: IAssetNode, dataValue: DataValue): UAVariable | undefined {
        let uaVariable: UAVariable | undefined;

        try {
            uaVariable = this.localServerNamespace.addVariable({
                componentOf: asset,
                browseName: assetNode.browseName,
                displayName: assetNode.displayName,
                description: assetNode.description,
                dataType: assetNode.dataTypeName,
                minimumSamplingInterval: assetNode.sampleInterval,
                value: this.createDataAccessor(assetNode, dataValue)
            });

            this.addressSpace.installHistoricalDataNode(uaVariable);
        }
        catch (ex) {
            this.server.log.error({ tags: [ModuleName] }, `Error while adding new UAVariable: ${ex.message}`);
        }

        return uaVariable;
    }

    private controlIndicatorLights(inputArguments: Variant[], _context: SessionContext): CallMethodResultOptions {
        this.server.log.info({ tags: [ModuleName] }, `controlIndicatorLights`);

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
            this.plcController.indicatorLightControl({
                ledRedState: inputArguments[0].value,
                ledYellowState: inputArguments[1].value,
                ledGreenState: inputArguments[2].value
            });
        }
        catch (ex) {
            this.server.log.error({ tags: [ModuleName] }, `Error in controlIndicatorLights: ${ex.message}`);

            callMethodResult.statusCode = StatusCodes.Bad;
            callMethodResult.outputArguments[0].value = false;
            callMethodResult.outputArguments[1].value = ex.message;
        }

        return callMethodResult;
    }

    private setIndicatorLightMode(inputArguments: Variant[], _context: SessionContext): CallMethodResultOptions {
        this.server.log.info({ tags: [ModuleName] }, `setIndicatorLightMode`);

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
            this.plcController.setIndicatorLightMode(inputArguments[0].value as IndicatorLightMode);
        }
        catch (ex) {
            this.server.log.error({ tags: [ModuleName] }, `Error in setIndicatorLightMode: ${ex.message}`);

            callMethodResult.statusCode = StatusCodes.Bad;
            callMethodResult.outputArguments[0].value = false;
            callMethodResult.outputArguments[1].value = ex.message;
        }

        return callMethodResult;
    }

    private async controlDistanceSensor(inputArguments: Variant[], _context: SessionContext): Promise<CallMethodResultOptions> {
        this.server.log.info({ tags: [ModuleName] }, `controlDistanceSensor`);

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

            const opcAsset = this.opcAssetMap.get('DistanceSensor');
            if (opcAsset) {
                if (inputArguments[0].value === 'START') {
                    opcAsset.asset.raiseEvent(this.eventTFLunaStartMeasurement, {});
                }
                else {
                    opcAsset.asset.raiseEvent(this.eventTFLunaStopMeasurement, {});
                }
            }
        }
        catch (ex) {
            this.server.log.error({ tags: [ModuleName] }, `Error in controlDistanceSensor: ${ex.message}`);

            callMethodResult.statusCode = StatusCodes.Bad;
            callMethodResult.outputArguments[0].value = false;
            callMethodResult.outputArguments[1].value = ex.message;
        }

        return callMethodResult;
    }

    private createDataAccessor(assetNode: IAssetNode, dataValue: DataValue): BindVariableOptionsVariation2 {
        return {
            timestamped_get: (): DataValue => {
                const deviceValue = this.plcController.getDeviceValue(assetNode.browseName);

                dataValue.value.value = deviceValue;
                dataValue.sourceTimestamp = new Date();

                return dataValue;
            },
            timestamped_set: (newDataValue: DataValue): StatusCodes => {
                if (newDataValue.value.dataType !== this.getDataTypeEnumFromString(assetNode.dataTypeName)) {
                    return StatusCodes.Bad;
                }

                this.plcController.setDeviceValue(assetNode.browseName, newDataValue.value.value);

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
