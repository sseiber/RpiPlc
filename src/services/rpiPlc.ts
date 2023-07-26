import { service, inject } from 'spryly';
import { Server } from '@hapi/hapi';
import {
    IRpiPlcServiceRequest,
    IRpiPlcServiceResponse,
    RpiPlcRequestAction
} from '../models/rpiPlcTypes';
import { PlcController } from './plcController';
import { RpiPlcOpcuaServer } from './opcuaServer';

const ModuleName = 'rpiPlcService';

@service(ModuleName)
export class RpiPlcService {
    @inject('$server')
    private server: Server;

    private plcControllers: PlcController[];
    private opcuaServer: RpiPlcOpcuaServer;

    public async init(): Promise<void> {
        this.server.log([ModuleName, 'info'], `RpiPlcService initialzation`);

        try {
            this.plcControllers = await this.initializePlcControllers();

            this.opcuaServer = await this.initializeOpcuaServer();
        }
        catch (ex) {
            this.server.log([ModuleName, 'error'], `An error occurred initializing the libgpiod library: ${ex.message}`);
        }
    }

    public async stopOpcuaServer(): Promise<void> {
        if (this.opcuaServer) {
            this.server.log([ModuleName, 'info'], '☮︎ Stopping opcua server');

            await this.opcuaServer.stop();
        }

        this.server.log(['shutdown', 'info'], `⏏︎ Server stopped`);
    }

    public async control(controlRequest: IRpiPlcServiceRequest): Promise<IRpiPlcServiceResponse> {
        const response: IRpiPlcServiceResponse = {
            succeeded: true,
            message: 'The request succeeded',
            status: false
        };

        this.server.log([ModuleName, 'info'], `RpiPlc request for was received`);

        try {
            let message;

            switch (controlRequest.action) {
                case RpiPlcRequestAction.IndicatorLight:
                    response.status = await this.plcControllers[controlRequest.plcId].indicatorLight(controlRequest.data);
                    break;

                case RpiPlcRequestAction.TfMeasurement:
                    await this.plcControllers[controlRequest.plcId].tfMeasurement(controlRequest.data);
                    response.message = `Plc distance measurement started...`;
                    break;

                default:
                    message = `RpiPlc request is not recognized`;
                    break;
            }

            response.message = message || `RpiPlc request was processed with status ${response.status}`;

            this.server.log([ModuleName, 'info'], response.message);
        }
        catch (ex) {
            response.succeeded = false;
            response.message = `RpiPlc request failed with exception: ${ex.message}`;

            this.server.log([ModuleName, 'error'], response.message);
        }

        return response;
    }

    private async initializePlcControllers(): Promise<PlcController[]> {
        this.server.log([ModuleName, 'info'], `initializePlcControllers`);

        const plcControllers: PlcController[] = [];

        try {
            const plcGpioConfigs = this.server.settings.app.rpiPlc.plcGpioConfigs;

            this.server.log([ModuleName, 'info'], `Plc controller configuration:\n${JSON.stringify(plcGpioConfigs)}\n`);

            this.server.log([ModuleName, 'info'], `Creating plc controllers`);
            let plcId = 0;
            for (const plcGpioConfig of plcGpioConfigs) {
                const plcController = new PlcController(this.server, plcId++, plcGpioConfig);

                await plcController.init();

                plcControllers.push(plcController);
            }
        }
        catch (ex) {
            this.server.log([ModuleName, 'error'], `An error occurred in initializePlcControllers: ${ex.message}`);
        }

        return plcControllers;
    }

    private async initializeOpcuaServer(): Promise<RpiPlcOpcuaServer> {
        let opcuaServer: RpiPlcOpcuaServer;

        try {
            this.server.log([ModuleName, 'info'], `initializeOpcuaServer`);

            this.server.log([ModuleName, 'info'], `Initializing server...`);
            opcuaServer = new RpiPlcOpcuaServer(this.server);

            await opcuaServer.start();

            this.server.log([ModuleName, 'info'], `Server started with endpoint: ${opcuaServer.getEndpoint()}`);
        }
        catch (ex) {
            this.server.log([ModuleName, 'error'], `An error occurred in initializeOpcuaServer: ${ex.message}`);
        }

        return opcuaServer;
    }
}
