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

    private plcController: PlcController;
    private opcuaServer: RpiPlcOpcuaServer;

    public async init(): Promise<void> {
        this.server.log([ModuleName, 'info'], `RpiPlcService initialzation`);

        try {
            this.plcController = await this.initializePlcController();

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
                    response.status = await this.plcController.indicatorLightControl(controlRequest.data);
                    break;

                case RpiPlcRequestAction.IndicatorMode:
                    response.status = await this.plcController.indicatorLightModeControl(controlRequest.data);
                    break;

                case RpiPlcRequestAction.TfMeasurement:
                    await this.plcController.tfMeasurementControl(controlRequest.data);
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

    private async initializePlcController(): Promise<PlcController> {
        this.server.log([ModuleName, 'info'], `initializePlcController`);

        let plcController: PlcController;

        try {
            const plcDeviceConfig = this.server.settings.app.rpiPlc.plcDeviceConfig;

            this.server.log([ModuleName, 'info'], `Plc controller configuration:\n${JSON.stringify(plcDeviceConfig)}\n`);

            this.server.log([ModuleName, 'info'], `Creating plc controllers`);

            plcController = new PlcController(this.server, plcDeviceConfig);

            await plcController.init();
        }
        catch (ex) {
            this.server.log([ModuleName, 'error'], `An error occurred in initializePlcController: ${ex.message}`);
        }

        return plcController;
    }

    private async initializeOpcuaServer(): Promise<RpiPlcOpcuaServer> {
        let opcuaServer: RpiPlcOpcuaServer;

        try {
            this.server.log([ModuleName, 'info'], `initializeOpcuaServer`);

            this.server.log([ModuleName, 'info'], `Initializing server...`);
            opcuaServer = new RpiPlcOpcuaServer(this.server, this.plcController);

            await opcuaServer.start();

            this.server.log([ModuleName, 'info'], `Server started with endpoint: ${opcuaServer.getEndpoint()}`);
        }
        catch (ex) {
            this.server.log([ModuleName, 'error'], `An error occurred in initializeOpcuaServer: ${ex.message}`);
        }

        return opcuaServer;
    }
}
