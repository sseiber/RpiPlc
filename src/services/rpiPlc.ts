import {
    FastifyInstance,
    FastifyPluginAsync
} from 'fastify';
import fp from 'fastify-plugin';
import {
    IIndicatorLightAction,
    IIndicatorLightModeAction,
    IObserveRequest,
    IControlRequest,
    ITfMeasurementAction,
    ControlRequestAction,
    IServiceResponse
} from '../models/rpiPlcTypes.js';
import { PlcController } from './plcController.js';
import { PluginName as ConfigPluginName } from '../plugins/config.js';

export const ServiceName = 'rpiPlcService';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IRpiPlcServiceOptions {
}

const rpiPlcServicePlugin: FastifyPluginAsync<IRpiPlcServiceOptions> = async (server: FastifyInstance, _options: IRpiPlcServiceOptions): Promise<void> => {
    server.log.info({ tags: [ServiceName] }, `registering...`);

    try {
        const rpiPlcService = await RpiPlcService.createRpiPlcService(server);

        server.decorate(ServiceName, rpiPlcService);
    }
    catch (ex: any) {
        server.log.error({ tags: [ServiceName] }, `Registering ${ServiceName} failed: ${ex.message}`);

        throw ex;
    }
};

export class RpiPlcService {
    public static async createRpiPlcService(server: FastifyInstance): Promise<RpiPlcService> {
        server.log.info({ tags: [ServiceName] }, `createRpiPlcService`);

        try {
            server.log.info({ tags: [ServiceName] }, `Starting initialization of PLC controller...`);

            const plcDeviceConfig = server.config.plcDeviceConfig;
            server.log.info({ tags: [ServiceName] }, `Creating plc controller`);
            server.log.info({ tags: [ServiceName] }, `Plc controller configuration:\n${JSON.stringify(plcDeviceConfig)}\n`);

            const plcController = PlcController.createPlcController(server, plcDeviceConfig);

            await plcController.init();

            server.log.info({ tags: [ServiceName] }, `Finished initializing PLC controller...`);
            server.log.info({ tags: [ServiceName] }, `Starting background initialization of OPCUA server...`);

            return new RpiPlcService(server, plcController);
        }
        catch (ex: any) {
            server.log.error({ tags: [ServiceName] }, `An error occurred in createRpiPlcService: ${ex.message}`);

            throw ex;
        }
    }

    private server: FastifyInstance;
    private plcController: PlcController;

    constructor(server: FastifyInstance, plcController: PlcController) {
        server.log.info({ tags: [ServiceName] }, `Constructing ${ServiceName}`);

        this.server = server;
        this.plcController = plcController;
    }

    public observe(observeRequest: IObserveRequest): IServiceResponse {
        const response: IServiceResponse = {
            succeeded: true,
            statusCode: 201,
            message: 'The request succeeded'
        };

        this.server.log.info({ tags: [ServiceName] }, `RpiPlc request for observe targets:\n${JSON.stringify(observeRequest.observeTargets, null, 4)})}`);

        try {
            let message;

            response.succeeded = this.plcController.observe(observeRequest.observeTargets);
            response.message = message ?? `RpiPlc request was processed with result succeeded=${response.succeeded}`;

            this.server.log.info({ tags: [ServiceName] }, response.message);
        }
        catch (ex: any) {
            response.succeeded = false;
            response.statusCode = 500;
            response.message = `RpiPlc request for failed with exception: ${ex.message}`;

            this.server.log.error({ tags: [ServiceName] }, response.message);
        }

        return response;
    }

    public async control(controlRequest: IControlRequest): Promise<IServiceResponse> {
        const response: IServiceResponse = {
            succeeded: true,
            statusCode: 201,
            message: 'The request succeeded'
        };

        this.server.log.info({ tags: [ServiceName] }, `RpiPlc request for was received`);

        try {
            let message;

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

            response.message = message ?? `RpiPlc request was processed with result succeeded=${response.succeeded}`;

            this.server.log.info({ tags: [ServiceName] }, response.message);
        }
        catch (ex: any) {
            response.succeeded = false;
            response.statusCode = 500;
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
    fastify: '5.x',
    name: ServiceName,
    dependencies: [
        ConfigPluginName
    ]
});
