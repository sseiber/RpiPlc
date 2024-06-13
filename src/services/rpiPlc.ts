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
        const rpiPlcService = new RpiPlcService(server);
        const rpiPlcInitialization = await rpiPlcService.init();
        if (!rpiPlcInitialization) {
            throw new Error('RpiPlcService failed to initialize');
        }

        server.decorate(ServiceName, rpiPlcService);
    }
    catch (ex: any) {
        server.log.error({ tags: [ServiceName] }, `Registering ${ServiceName} failed: ${ex.message}`);
    }
};

export class RpiPlcService {
    private server: FastifyInstance;
    private plcController!: PlcController;
    private opcuaServer!: RpiPlcOpcuaServer;

    constructor(server: FastifyInstance) {
        server.log.info({ tags: [ServiceName] }, `Constructing ${ServiceName}`);

        this.server = server;
    }

    public async init(): Promise<boolean> {
        this.server.log.info({ tags: [ServiceName] }, `RpiPlcService initialization`);

        try {
            const plcController = await this.initializePlcController();
            if (!plcController) {
                throw new Error('Plc controller failed to initialize');
            }

            const opcuaServer = await this.initializeOpcuaServer();
            if (!opcuaServer) {
                throw new Error('Opcua server failed to initialize');
            }

            this.plcController = plcController;
            this.opcuaServer = opcuaServer;
        }
        catch (ex: any) {
            this.server.log.error({ tags: [ServiceName] }, `An error occurred initializing the RpiPlc service: ${ex.message}`);

            return false;
        }

        return true;
    }

    public observe(observeRequest: IObserveRequest): IRpiPlcResponse {
        const response: IRpiPlcResponse = {
            succeeded: true,
            message: 'The request succeeded',
            status: true
        };

        this.server.log.info({ tags: [ServiceName] }, `RpiPlc request for observe targets:\n${JSON.stringify(observeRequest.observeTargets, null, 4)})}`);

        try {
            let message;

            response.status = this.plcController.observe(observeRequest.observeTargets);
            response.message = message ?? `RpiPlc request for was processed with status ${response.status}`;

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
            message: 'The request succeeded',
            status: false
        };

        this.server.log.info({ tags: [ServiceName] }, `RpiPlc request for was received`);

        try {
            let message;

            switch (controlRequest.action) {
                case ControlRequestAction.IndicatorLight:
                    response.status = this.plcController.indicatorLightControl(controlRequest.data as IIndicatorLightAction);
                    break;

                case ControlRequestAction.IndicatorMode:
                    response.status = this.plcController.indicatorLightModeControl(controlRequest.data as IIndicatorLightModeAction);
                    break;

                case ControlRequestAction.TfMeasurement:
                    await this.plcController.tfMeasurementControl(controlRequest.data as ITfMeasurementAction);
                    response.message = `Plc distance measurement started...`;
                    break;

                default:
                    message = `RpiPlc request is not recognized`;
                    break;
            }

            response.message = message || `RpiPlc request was processed with status ${response.status}`;

            this.server.log.info({ tags: [ServiceName] }, response.message);
        }
        catch (ex: any) {
            response.succeeded = false;
            response.message = `RpiPlc request failed with exception: ${ex.message}`;

            this.server.log.error({ tags: [ServiceName] }, response.message);
        }

        return response;
    }

    private async initializePlcController(): Promise<PlcController | undefined> {
        this.server.log.info({ tags: [ServiceName] }, `initializePlcController`);

        let plcController: PlcController | undefined;

        try {
            const plcDeviceConfig = this.server.main.plcDeviceConfig;

            this.server.log.info({ tags: [ServiceName] }, `Plc controller configuration:\n${JSON.stringify(plcDeviceConfig)}\n`);

            this.server.log.info({ tags: [ServiceName] }, `Creating plc controllers`);

            plcController = new PlcController(this.server, plcDeviceConfig);

            await plcController.init();
        }
        catch (ex: any) {
            this.server.log.error({ tags: [ServiceName] }, `An error occurred in initializePlcController: ${ex.message}`);
        }

        return plcController;
    }

    private async initializeOpcuaServer(): Promise<RpiPlcOpcuaServer | undefined> {
        let opcuaServer: RpiPlcOpcuaServer | undefined;

        try {
            this.server.log.info({ tags: [ServiceName] }, `initializeOpcuaServer`);

            this.server.log.info({ tags: [ServiceName] }, `Initializing server...`);
            opcuaServer = new RpiPlcOpcuaServer(this.server, this.plcController);

            await opcuaServer.start();

            this.server.log.info({ tags: [ServiceName] }, `Server started with endpoint: ${opcuaServer.getEndpoint()}`);
        }
        catch (ex: any) {
            this.server.log.error({ tags: [ServiceName] }, `An error occurred in initializeOpcuaServer: ${ex.message}`);
        }

        return opcuaServer;
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
