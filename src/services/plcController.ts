import { Server } from '@hapi/hapi';
import {
    IPlcDeviceConfig,
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

class PlcDataAccessor {
    public get: () => any;
    public set?: (value: any) => void;
}

export class PlcController {
    private server: Server;
    private plcId: number;

    private gpioAvailable: boolean;
    private bcm2835: Chip;
    private indicatorLightRedPin: Line;
    private indicatorLightYellowPin: Line;
    private indicatorLightGreenPin: Line;

    private plcDeviceConfig: IPlcDeviceConfig;
    private serialPort: SerialPort;
    private tfLunaResponseParser: TFLunaResponseParser;
    private tfLunaStatus: ITFLunaStatus;
    private deviceMap: Map<string, PlcDataAccessor> = new Map<string, PlcDataAccessor>();

    constructor(server: Server, plcDeviceConfig: IPlcDeviceConfig) {
        this.server = server;
        this.plcDeviceConfig = plcDeviceConfig;
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
        this.server.log([ModuleName, 'info'], `${ModuleName} initialzation plcId: ${this.plcId} `);
        this.server.log([ModuleName, 'info'], `${ModuleName} initialzation: libgpiod version: ${version()}, status: ${available() ? 'available' : 'unavailable'}`);

        try {
            this.gpioAvailable = available();
            if (!this.gpioAvailable) {
                throw new Error('GPIO is not available');
            }

            this.bcm2835 = new Chip(0);

            this.server.log([ModuleName, 'info'], `Initializing plc controller GPIO pins`);

            const plcConfigDeviceNames = Object.keys(this.plcDeviceConfig);

            this.indicatorLightRedPin = new Line(this.bcm2835, this.plcDeviceConfig.indicatorLightDeviceRed.pin);
            if (this.plcDeviceConfig.indicatorLightDeviceRed.mode === GPIOPinMode.Output) {
                this.indicatorLightRedPin.requestOutputMode();
            }
            else {
                this.indicatorLightRedPin.requestInputMode();
            }

            this.deviceMap.set(plcConfigDeviceNames[0], {
                get: () => this.indicatorLightRedPin.getValue(),
                set: (value: any) => this.indicatorLightRedPin.setValue(value)
            });

            this.indicatorLightYellowPin = new Line(this.bcm2835, this.plcDeviceConfig.indicatorLightDeviceYellow.pin);
            if (this.plcDeviceConfig.indicatorLightDeviceYellow.mode === GPIOPinMode.Output) {
                this.indicatorLightYellowPin.requestOutputMode();
            }
            else {
                this.indicatorLightYellowPin.requestInputMode();
            }

            this.deviceMap.set(plcConfigDeviceNames[1], {
                get: () => this.indicatorLightYellowPin.getValue(),
                set: (value: any) => this.indicatorLightYellowPin.setValue(value)
            });

            this.indicatorLightGreenPin = new Line(this.bcm2835, this.plcDeviceConfig.indicatorLightDeviceGreen.pin);
            if (this.plcDeviceConfig.indicatorLightDeviceGreen.mode === GPIOPinMode.Output) {
                this.indicatorLightGreenPin.requestOutputMode();
            }
            else {
                this.indicatorLightGreenPin.requestInputMode();
            }

            this.deviceMap.set(plcConfigDeviceNames[2], {
                get: () => this.indicatorLightGreenPin.getValue(),
                set: (value: any) => this.indicatorLightGreenPin.setValue(value)
            });

            this.serialPort = await this.openPort(this.plcDeviceConfig.tfLunaDevice.serialPort, this.plcDeviceConfig.tfLunaDevice.buadRate);

            // await this.restoreTFLunaSettings();

            // start with sampleRate === 0 to turn off sampling
            await this.setTFLunaSampleRate(0);

            await this.saveTFLunaSettings();

            await this.getTFLunaVersion();

            this.deviceMap.set(plcConfigDeviceNames[3], {
                get: () => this.tfLunaStatus.sampleRate === 0 ? 0 : this.tfLunaStatus.measurement,
                set: (value: any) => void this.setTFLunaSampleRate(!value ? 0 : this.plcDeviceConfig.tfLunaDevice.sampleRate)
            });
        }
        catch (ex) {
            this.server.log([ModuleName, 'error'], `Error during init: ${ex.message}`);
        }
    }

    public getDeviceValue(deviceId: string): any {
        const device = this.deviceMap.get(deviceId);

        return device?.get();
    }

    public setDeviceValue(deviceId: string, value: any): void {
        const device = this.deviceMap.get(deviceId);

        if (device?.set) {
            device.set(value);
        }
    }

    public async tfMeasurement(tfMeasurementaction: ITfMeasurementAction): Promise<void> {
        this.server.log([ModuleName, 'info'], `TFLuna measurement`);

        try {
            if (tfMeasurementaction.measurementState === TfMeasurementState.Start) {
                await this.setTFLunaSampleRate(this.plcDeviceConfig.tfLunaDevice.sampleRate);
            }
            else {
                await this.setTFLunaSampleRate(0);
            }
        }
        catch (ex) {
            this.server.log([ModuleName, 'error'], `Error during TFLuna measurement control: ${ex.message}`);
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
            this.server.log([ModuleName, 'info'], `GPIO access is unavailable`);
        }

        return status;
    }

    private portError(err: Error): void {
        this.server.log([ModuleName, 'error'], `Serialport Error: ${err.message}`);
    }

    private portOpen(): void {
        this.server.log([ModuleName, 'info'], `Serialport open`);
    }

    private portClosed(): void {
        this.server.log([ModuleName, 'info'], `Serialport closed`);
    }

    private tfLunaResponseParserHandler(data: ITFLunaResponse): void {
        const commandId = data?.commandId;
        if (commandId) {
            switch (commandId) {
                case TFLunaRestoreDefaultSettingsCommand:
                    this.tfLunaStatus.restoreDefaultSettingsStatus = (data as ITFLunaRestoreDefaultSettingsResponse).status;

                    this.server.log([ModuleName, 'info'], `Restore default settings response status: ${this.tfLunaStatus.restoreDefaultSettingsStatus}`);
                    break;

                case TFLunaSaveCurrentSettingsCommand:
                    this.tfLunaStatus.saveCurrentSettingsStatus = (data as ITFLunaSaveCurrentSettingsResponse).status;

                    this.server.log([ModuleName, 'info'], `Save current settings response status: ${this.tfLunaStatus.saveCurrentSettingsStatus}`);
                    break;

                case TFLunaSetBaudRateCommand:
                    this.tfLunaStatus.baudRate = (data as ITFLunaBaudResponse).baudRate;

                    this.server.log([ModuleName, 'info'], `Current baudRate: ${this.tfLunaStatus.baudRate}`);
                    break;

                case TFLunaSetSampleRateCommand:
                    this.tfLunaStatus.sampleRate = (data as ITFLunaSampleRateResponse).sampleRate;

                    this.server.log([ModuleName, 'info'], `Set sample rate response: ${this.tfLunaStatus.sampleRate}`);
                    break;

                case TFLunaGetVersionCommand:
                    this.tfLunaStatus.version = (data as ITFLunaVersionResponse).version;

                    this.server.log([ModuleName, 'info'], `Get current version response: ${this.tfLunaStatus.version}`);
                    break;

                case TFLunaMeasurementCommand:
                    this.tfLunaStatus.measurement = (data as ITFLunaMeasureResponse).distCm;

                    this.server.log([ModuleName, 'info'], `Get measurement response: ${this.tfLunaStatus.measurement}`);
                    break;

                default:
                    this.server.log([ModuleName, 'debug'], `Unknown response command: ${commandId}`);
                    break;
            }
        }
        else {
            this.server.log([ModuleName, 'error'], `Received unknown response data...`);
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
            logEnabled: this.plcDeviceConfig.tfLunaDevice.serialParserLog,
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
        this.server.log([ModuleName, 'info'], `Restore default settings`);

        await this.writeTFLunaCommand(Buffer.from(TFLunaRestoreDefaultSettingsPrefix.concat([0x00])));
    }

    private async saveTFLunaSettings(): Promise<void> {
        this.server.log([ModuleName, 'info'], `Save current settings settings`);

        await this.writeTFLunaCommand(Buffer.from(TFLunaSaveCurrentSettingsPrefix.concat([0x00])));
    }

    // @ts-ignore
    private async setTFLunaBaudRate(baudRate = 115200): Promise<void> {
        this.server.log([ModuleName, 'info'], `Set baud rate request with value: ${baudRate}`);

        /* eslint-disable no-bitwise */
        const data1 = (baudRate & 0xFF);
        const data2 = (baudRate & 0xFF00) >> 8;
        const data3 = (baudRate & 0x00FF0000) >> 16;
        const data4 = (baudRate & 0xFF000000) >> 24;
        /* eslint-enable no-bitwise */

        await this.writeTFLunaCommand(Buffer.from(TFLunaSetBaudRatePrefix.concat([data1, data2, data3, data4, 0x00])));
    }

    private async setTFLunaSampleRate(sampleRate: number): Promise<void> {
        this.server.log([ModuleName, 'info'], `Set sample rate request with value: ${sampleRate}`);

        await this.writeTFLunaCommand(Buffer.from(TFLunaSetSampleRatePrefix.concat([sampleRate, 0x00, 0x00])));
    }

    private async getTFLunaVersion(): Promise<void> {
        this.server.log([ModuleName, 'info'], `Get version request`);

        await this.writeTFLunaCommand(Buffer.from(TFLunaGetVersionPrefix.concat([0x00])));
    }

    private async writeTFLunaCommand(writeData: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            this.serialPort.write(writeData, async (writeError) => {
                if (writeError) {
                    this.server.log([ModuleName, 'error'], `Serial port write error: ${writeError.message}`);

                    return reject(writeError);
                }

                this.serialPort.drain(async (drainError) => {
                    if (drainError) {
                        this.server.log([ModuleName, 'error'], `Serial port drain error: ${drainError.message}`);

                        return reject(drainError);
                    }

                    return resolve();
                });
            });
        });
    }
}
