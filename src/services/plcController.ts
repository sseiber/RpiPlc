import { Server } from '@hapi/hapi';
import {
    IPlcGpioConfig,
    ITFLunaStatus,
    TFLunaRestoreDefaultSettingsCommand,
    TFLunaRestoreDefaultSettingsPrefix,
    TFLunaSaveCurrentSettingsCommand,
    TFLunaSaveCurrentSettingsPrefix,
    TFLunaSetBaudRateCommand,
    TFLunaSetBaudRatePrefix,
    TFLunaSetSampleRateCommand,
    TFLunaSetSampleRatePrefix,
    TFLunaGetVersionCommand,
    TFLunaGetVersionPrefix,
    TFLunaMeasurementPrefix,
    ITFLunaRestoreDefaultSettingsResponse,
    ITFLunaSaveCurrentSettingsResponse,
    ITFLunaResponse,
    ITFLunaBaudResponse,
    ITFLunaSampleRateResponse,
    ITFLunaVersionResponse,
    ITFLunaMeasureResponse,
    TFLunaMeasurementCommand,
    GPIOPinMode,
    IIndicatorLightAction,
    ITfMeasurementAction,
    TfMeasurementState
} from '../models/rpiPlcTypes';
import { SerialPort } from 'serialport';
import { TFLunaResponseParser } from './tfLunaResponseParser';
import { version, Chip, Line, available } from 'node-libgpiod';

const ModuleName = 'PlcController';

export class PlcController {
    private server: Server;
    private moduleName: string;
    private plcId: number;

    private gpioAvailable: boolean;
    private bcm2835: Chip;
    private indicatorLightRedPin: Line;
    private indicatorLightYellowPin: Line;
    private indicatorLightGreenPin: Line;

    private plcGpioConfig: IPlcGpioConfig;
    private serialPort: SerialPort;
    private tfLunaResponseParser: TFLunaResponseParser;
    private tfLunaStatus: ITFLunaStatus;

    constructor(server: Server, plcId: number, plcGpioConfig: IPlcGpioConfig) {
        this.server = server;
        this.moduleName = `${ModuleName}-${plcId}`;
        this.plcId = plcId;
        this.plcGpioConfig = plcGpioConfig;
        this.tfLunaStatus = {
            restoreDefaultSettingsStatus: 0,
            saveCurrentSettingsStatus: 0,
            baudRate: 0,
            sampleRate: 0,
            version: '0.0.0',
            measurement: 0
        };
    }

    public async init(): Promise<void> {
        this.server.log([this.moduleName, 'info'], `${ModuleName} initialzation plcId: ${this.plcId} `);
        this.server.log([this.moduleName, 'info'], `${ModuleName} initialzation: libgpiod version: ${version()}, status: ${available() ? 'available' : 'unavailable'}`);

        try {
            this.gpioAvailable = available();
            if (!this.gpioAvailable) {
                throw new Error('GPIO is not available');
            }

            this.bcm2835 = new Chip(0);

            this.server.log([this.moduleName, 'info'], `Initializing plc controller GPIO pins`);

            this.indicatorLightRedPin = new Line(this.bcm2835, this.plcGpioConfig.indicatorLightRedPin.pin);
            if (this.plcGpioConfig.indicatorLightRedPin.mode === GPIOPinMode.Output) {
                this.indicatorLightRedPin.requestOutputMode();
            }
            else {
                this.indicatorLightRedPin.requestInputMode();
            }

            this.indicatorLightYellowPin = new Line(this.bcm2835, this.plcGpioConfig.indicatorLightYellowPin.pin);
            if (this.plcGpioConfig.indicatorLightYellowPin.mode === GPIOPinMode.Output) {
                this.indicatorLightYellowPin.requestOutputMode();
            }
            else {
                this.indicatorLightYellowPin.requestInputMode();
            }

            this.indicatorLightGreenPin = new Line(this.bcm2835, this.plcGpioConfig.indicatorLightGreenPin.pin);
            if (this.plcGpioConfig.indicatorLightGreenPin.mode === GPIOPinMode.Output) {
                this.indicatorLightGreenPin.requestOutputMode();
            }
            else {
                this.indicatorLightGreenPin.requestInputMode();
            }

            this.serialPort = await this.openPort(this.plcGpioConfig.tfLunaSerialPort, this.plcGpioConfig.tfLunaBuadRate);

            // await this.restoreTFLunaSettings();

            // start with sampleRate === 0 to turn off sampling
            await this.setTFLunaSampleRate(0);

            await this.saveTFLunaSettings();

            await this.getTFLunaVersion();
        }
        catch (ex) {
            this.server.log([this.moduleName, 'error'], `Error during init: ${ex.message}`);
        }
    }

    public async tfMeasurement(tfMeasurementaction: ITfMeasurementAction): Promise<void> {
        this.server.log([this.moduleName, 'info'], `TFLuna measurement`);

        try {
            if (tfMeasurementaction.measurementState === TfMeasurementState.Start) {
                await this.setTFLunaSampleRate(this.plcGpioConfig.tfLunaSampleRate);
            }
            else {
                await this.setTFLunaSampleRate(0);
            }
        }
        catch (ex) {
            this.server.log([this.moduleName, 'error'], `Error during TFLuna measurement control: ${ex.message}`);
        }
    }

    public async getTFLunaMeasurement(): Promise<void> {
        await this.writeTFLunaCommand(Buffer.from(TFLunaMeasurementPrefix.concat([0x00])));
    }

    public async indicatorLight(lightAction: IIndicatorLightAction): Promise<any> {
        let status = false;

        if (this.gpioAvailable) {
            this.indicatorLightRedPin.setValue(lightAction.ledRedState);
            this.indicatorLightYellowPin.setValue(lightAction.ledYellowState);
            this.indicatorLightGreenPin.setValue(lightAction.ledGreenState);

            status = true;
        }
        else {
            this.server.log([this.moduleName, 'info'], `GPIO access is unavailable`);
        }

        return status;
    }

    private portError(err: Error): void {
        this.server.log([this.moduleName, 'error'], `Serialport Error: ${err.message}`);
    }

    private portOpen(): void {
        this.server.log([this.moduleName, 'info'], `Serialport open`);
    }

    private portClosed(): void {
        this.server.log([this.moduleName, 'info'], `Serialport closed`);
    }

    private tfLunaResponseParserHandler(data: ITFLunaResponse): void {
        const commandId = data?.commandId;
        if (commandId) {
            switch (commandId) {
                case TFLunaRestoreDefaultSettingsCommand:
                    this.tfLunaStatus.restoreDefaultSettingsStatus = (data as ITFLunaRestoreDefaultSettingsResponse).status;

                    this.server.log([this.moduleName, 'info'], `Restore default settings response status: ${this.tfLunaStatus.restoreDefaultSettingsStatus}`);
                    break;

                case TFLunaSaveCurrentSettingsCommand:
                    this.tfLunaStatus.saveCurrentSettingsStatus = (data as ITFLunaSaveCurrentSettingsResponse).status;

                    this.server.log([this.moduleName, 'info'], `Save current settings response status: ${this.tfLunaStatus.saveCurrentSettingsStatus}`);
                    break;

                case TFLunaSetBaudRateCommand:
                    this.tfLunaStatus.baudRate = (data as ITFLunaBaudResponse).baudRate;

                    this.server.log([this.moduleName, 'info'], `Current baudRate: ${this.tfLunaStatus.baudRate}`);
                    break;

                case TFLunaSetSampleRateCommand:
                    this.tfLunaStatus.sampleRate = (data as ITFLunaSampleRateResponse).sampleRate;

                    this.server.log([this.moduleName, 'info'], `Set sample rate response: ${this.tfLunaStatus.sampleRate}`);
                    break;

                case TFLunaGetVersionCommand:
                    this.tfLunaStatus.version = (data as ITFLunaVersionResponse).version;

                    this.server.log([this.moduleName, 'info'], `Get current version response: ${this.tfLunaStatus.version}`);
                    break;

                case TFLunaMeasurementCommand:
                    this.tfLunaStatus.measurement = (data as ITFLunaMeasureResponse).distCm;

                    this.server.log([this.moduleName, 'info'], `Get measurement response: ${this.tfLunaStatus.measurement}`);
                    break;

                default:
                    this.server.log([this.moduleName, 'debug'], `Unknown response command: ${commandId}`);
                    break;
            }
        }
        else {
            this.server.log([this.moduleName, 'error'], `Received unknown response data...`);
        }
    }

    private async openPort(device: string, baudRate: number): Promise<SerialPort> {
        const port = new SerialPort({
            path: device,
            baudRate,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            autoOpen: false
        });
        port.on('error', this.portError.bind(this));
        port.on('open', this.portOpen.bind(this));
        port.on('close', this.portClosed.bind(this));

        this.tfLunaResponseParser = port.pipe(new TFLunaResponseParser({
            logEnabled: this.plcGpioConfig.tfLunaSerialParserLog,
            objectMode: true
        }));
        this.tfLunaResponseParser.on('data', this.tfLunaResponseParserHandler.bind(this));

        return new Promise((resolve, reject) => {
            port.open((err) => {
                if (err) {
                    return reject(err);
                }

                return resolve(port);
            });
        });
    }

    // @ts-ignore
    private async restoreTFLunaSettings(): Promise<void> {
        this.server.log([this.moduleName, 'info'], `Restore default settings`);

        await this.writeTFLunaCommand(Buffer.from(TFLunaRestoreDefaultSettingsPrefix.concat([0x00])));
    }

    private async saveTFLunaSettings(): Promise<void> {
        this.server.log([this.moduleName, 'info'], `Save current settings settings`);

        await this.writeTFLunaCommand(Buffer.from(TFLunaSaveCurrentSettingsPrefix.concat([0x00])));
    }

    // @ts-ignore
    private async setTFLunaBaudRate(baudRate = 115200): Promise<void> {
        this.server.log([this.moduleName, 'info'], `Set baud rate request with value: ${baudRate}`);

        /* eslint-disable no-bitwise */
        const data1 = (baudRate & 0xFF);
        const data2 = (baudRate & 0xFF00) >> 8;
        const data3 = (baudRate & 0x00FF0000) >> 16;
        const data4 = (baudRate & 0xFF000000) >> 24;
        /* eslint-enable no-bitwise */

        await this.writeTFLunaCommand(Buffer.from(TFLunaSetBaudRatePrefix.concat([data1, data2, data3, data4, 0x00])));
    }

    private async setTFLunaSampleRate(sampleRate: number): Promise<void> {
        this.server.log([this.moduleName, 'info'], `Set sample rate request with value: ${sampleRate}`);

        await this.writeTFLunaCommand(Buffer.from(TFLunaSetSampleRatePrefix.concat([sampleRate, 0x00, 0x00])));
    }

    private async getTFLunaVersion(): Promise<void> {
        this.server.log([this.moduleName, 'info'], `Get version request`);

        await this.writeTFLunaCommand(Buffer.from(TFLunaGetVersionPrefix.concat([0x00])));
    }

    private async writeTFLunaCommand(writeData: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            this.serialPort.write(writeData, async (writeError) => {
                if (writeError) {
                    this.server.log([this.moduleName, 'error'], `Serial port write error: ${writeError.message}`);

                    return reject(writeError);
                }

                this.serialPort.drain(async (drainError) => {
                    if (drainError) {
                        this.server.log([this.moduleName, 'error'], `Serial port drain error: ${drainError.message}`);

                        return reject(drainError);
                    }

                    return resolve();
                });
            });
        });
    }
}
