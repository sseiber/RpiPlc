import {
    FastifyInstance,
    FastifyPluginAsync
} from 'fastify';
import fp from 'fastify-plugin';
import {
    IIndicatorLightAction,
    IIndicatorLightModeAction,
    IObserveRequest,
    IRpiPlcResponse,
    IControlRequest,
    ITfMeasurementAction,
    ControlRequestAction
} from '../models/rpiPlcTypes';
import { PlcController } from './plcController';
import { RpiPlcOpcuaServer } from './opcuaServer';

const ServiceName = 'rpiPlcService';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IRpiPlcServiceOptions {
}

const rpiPlcServicePlugin: FastifyPluginAsync<IRpiPlcServiceOptions> = async (server: FastifyInstance, _options: IRpiPlcServiceOptions): Promise<void> => {
    server.log.info({ tags: [ServiceName] }, `Registering ${ServiceName}`);

    try {
        await new Promise<void>((resolve, _reject) => {
            const rpiPlcService = new RpiPlcService(server);

            // start background initialization of the service components
            void rpiPlcService.initializePlcServiceComponents();

            server.decorate(ServiceName, rpiPlcService);

            return resolve();
        });
    }
    catch (ex: any) {
        server.log.error({ tags: [ServiceName] }, `Registering ${ServiceName} failed: ${ex.message}`);
    }
};

export class RpiPlcService {
    private server: FastifyInstance;
    private plcController!: PlcController;
    private opcuaServer!: RpiPlcOpcuaServer;
    private rpiPlcServiceInitialized = false;

    constructor(server: FastifyInstance) {
        server.log.info({ tags: [ServiceName] }, `Constructing ${ServiceName}`);

        this.server = server;
    }

    public async initializePlcServiceComponents(): Promise<void> {
        this.server.log.info({ tags: [ServiceName] }, `initializePlcServiceComponents`);

        try {
            this.server.log.info({ tags: [ServiceName] }, `Starting background initialization of PLC controller...`);

            const plcDeviceConfig = this.server.rootConfig.plcDeviceConfig;
            this.server.log.info({ tags: [ServiceName] }, `Creating plc controllers`);
            this.server.log.info({ tags: [ServiceName] }, `Plc controller configuration:\n${JSON.stringify(plcDeviceConfig)}\n`);

            const plcController = new PlcController(this.server, plcDeviceConfig);

            await plcController.init();

            this.plcController = plcController;

            this.server.log.info({ tags: [ServiceName] }, `Finished initializing PLC controller...`);
            this.server.log.info({ tags: [ServiceName] }, `Starting background initialization of OPCUA server...`);

            const opcuaServer = new RpiPlcOpcuaServer(this.server, this.plcController);

            await opcuaServer.start();

            this.opcuaServer = opcuaServer;

            this.server.log.info({ tags: [ServiceName] }, `OPCUA server started with endpoint: ${opcuaServer.getEndpoint()}`);

            this.rpiPlcServiceInitialized = true;
        }
        catch (ex: any) {
            this.server.log.error({ tags: [ServiceName] }, `An error occurred in initializePlcServiceComponents: ${ex.message}`);
        }
    }

    public observe(observeRequest: IObserveRequest): IRpiPlcResponse {
        const response: IRpiPlcResponse = {
            succeeded: true,
            message: 'The request succeeded'
        };

        this.server.log.info({ tags: [ServiceName] }, `RpiPlc request for observe targets:\n${JSON.stringify(observeRequest.observeTargets, null, 4)})}`);

        try {
            let message;

            if (!this.rpiPlcServiceInitialized) {
                throw new Error('RpiPlcService is not initialized');
            }

            response.succeeded = this.plcController.observe(observeRequest.observeTargets);
            response.message = message ?? `RpiPlc request was processed with result succeeded=${response.succeeded}`;

            this.server.log.info({ tags: [ServiceName] }, response.message);
        }
        catch (ex: any) {
            response.succeeded = false;
            response.message = `RpiPlc request for failed with exception: ${ex.message}`;

            this.server.log.error({ tags: [ServiceName] }, response.message);
        }

        return response;
    }

    public async stopOpcuaServer(): Promise<void> {
        if (this.opcuaServer) {
            this.server.log.info({ tags: [ServiceName] }, '☮︎ Stopping opcua server');

            await this.opcuaServer.stop();
        }

        this.server.log.info({ tags: [ServiceName] }, `⏏︎ Server stopped`);
    }

    public async control(controlRequest: IControlRequest): Promise<IRpiPlcResponse> {
        const response: IRpiPlcResponse = {
            succeeded: true,
            message: 'The request succeeded'
        };

        this.server.log.info({ tags: [ServiceName] }, `RpiPlc request for was received`);

        try {
            let message;

            if (!this.rpiPlcServiceInitialized) {
                throw new Error('RpiPlcService is not initialized');
            }

            switch (controlRequest.action) {
                case ControlRequestAction.IndicatorLight:
                    response.succeeded = this.plcController.indicatorLightControl(controlRequest.data as IIndicatorLightAction);
                    break;

                case ControlRequestAction.IndicatorMode:
                    response.succeeded = this.plcController.indicatorLightModeControl(controlRequest.data as IIndicatorLightModeAction);
                    break;

                case ControlRequestAction.TfMeasurement:
                    await this.plcController.tfMeasurementControl(controlRequest.data as ITfMeasurementAction);
                    response.message = `Plc distance measurement started...`;
                    break;

                default:
                    message = `RpiPlc request is not recognized`;
                    break;
            }

            response.message = message || `RpiPlc request was processed with result succeeded=${response.succeeded}`;

            this.server.log.info({ tags: [ServiceName] }, response.message);
        }
        catch (ex: any) {
            response.succeeded = false;
            response.message = `RpiPlc request failed with exception: ${ex.message}`;

            this.server.log.error({ tags: [ServiceName] }, response.message);
        }

        return response;
    }
}

declare module 'fastify' {
    interface FastifyInstance {
        [ServiceName]: RpiPlcService;
    }
}

export default fp(rpiPlcServicePlugin, {
    fastify: '4.x',
    name: ServiceName,
    dependencies: [
        'config'
    ]
});
