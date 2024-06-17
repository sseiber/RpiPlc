import { FastifyInstance } from 'fastify';
import {
    ObserveTarget,
    ActiveObserveTargets,
    ActiveObserveTargetsDefaults,
    IPlcDeviceConfig,
    ITFLunaStatus,
    TFLunaRestoreDefaultSettingsCommand,
    // TFLunaRestoreDefaultSettingsPrefix,
    TFLunaSaveCurrentSettingsCommand,
    TFLunaSaveCurrentSettingsPrefix,
    TFLunaSetBaudRateCommand,
    TFLunaSetBaudRatePrefix,
    TFLunaSetSampleRateCommand,
    TFLunaSetSampleRatePrefix,
    TFLunaSoftResetPrefix,
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
    IndicatorLightMode,
    IIndicatorLightModeAction,
    TfMeasurementAction,
    ITfMeasurementAction,
    TFLunaSoftResetCommand,
    ITFLunaSoftResetResponse
} from '../models/rpiPlcTypes';
import { SerialPort } from 'serialport';
import { TFLunaResponseParser } from './tfLunaResponseParser';
import * as gpio from 'node-libgpiod';
import { DeferredPromise, sleep } from '../utils';

const ModuleName = 'plcController';

class PlcDataAccessor {
    public get: () => any;
    public set?: (value: any) => void;
}

export class PlcController {
    private server: FastifyInstance;
    private activeObserveTargets: ActiveObserveTargets;
    private bcm2835: gpio.Chip;
    private indicatorLightRedPin: gpio.Line;
    private indicatorLightYellowPin: gpio.Line;
    private indicatorLightGreenPin: gpio.Line;

    private indicatorLightMode: IndicatorLightMode = IndicatorLightMode.GREEN;
    private indicatorLightModeBlinkState = 0;

    private plcDeviceConfig: IPlcDeviceConfig;
    private serialPort: SerialPort;
    private tfLunaResponseParser: TFLunaResponseParser;
    private tfLunaStatus: ITFLunaStatus;
    private deferredPromiseRestoreTFLunaSettings: DeferredPromise<void> = new DeferredPromise<void>();
    private deferredPromiseSaveTFLunaSettings: DeferredPromise<void> = new DeferredPromise<void>();
    private deferredPromiseSoftReset: DeferredPromise<void> = new DeferredPromise<void>();
    private deferredPromiseSetBaudRate: DeferredPromise<void> = new DeferredPromise<void>();
    private deferredPromiseSetSampleRate: DeferredPromise<void> = new DeferredPromise<void>();
    private deferredPromiseGetLunaVersion: DeferredPromise<void> = new DeferredPromise<void>();
    // private tfLunaMeasurementTimer: NodeJS.Timeout;
    private deviceMap: Map<string, PlcDataAccessor> = new Map<string, PlcDataAccessor>();

    constructor(server: FastifyInstance, plcDeviceConfig: IPlcDeviceConfig) {
        this.server = server;
        this.plcDeviceConfig = plcDeviceConfig;
        this.activeObserveTargets = {
            ...ActiveObserveTargetsDefaults
        };
        this.tfLunaStatus = {
            restoreDefaultSettingsStatus: 0,
            saveCurrentSettingsStatus: 0,
            softResetStatus: 0,
            baudRate: 0,
            sampleRate: 0,
            version: '0.0.0',
            measurement: 0
        };
        // this.tfLunaMeasurementTimer = null;
    }

    public async init(): Promise<void> {
        this.server.log.info({ tags: [ModuleName] }, `${ModuleName} initialization`);

        try {
            // wait for up to 15 seconds for GPIO to become available.
            // NOTE:
            // this is a mitigation for the kubelet orchestrator which may have not finished
            // terminating a previous version of the container before starting this new instance.
            for (let initCount = 0; initCount < 5 && !gpio.available(); initCount++) {
                await sleep(3000);

                this.server.log.info({ tags: [ModuleName] }, `${ModuleName} gpio is not available, check 1/${initCount + 1}...`);
            }

            if (!gpio.available()) {
                throw new Error('GPIO is not available');
            }

            this.server.log.info({ tags: [ModuleName] }, `${ModuleName} libgpiod is available`);

            this.bcm2835 = new gpio.Chip(0);

            this.server.log.info({ tags: [ModuleName] }, `Initializing plc controller GPIO pins`);

            for (const [plcDeviceConfigKey, plcDeviceConfigValue] of Object.entries(this.plcDeviceConfig)) {
                switch (plcDeviceConfigKey) {
                    case 'indicatorLightDeviceRed':
                        this.server.log.info({ tags: [ModuleName] }, `Initializing ${plcDeviceConfigKey} pin: ${plcDeviceConfigValue.pin}`);

                        this.indicatorLightRedPin = new gpio.Line(this.bcm2835, Number(plcDeviceConfigValue.pin));
                        if (plcDeviceConfigValue.mode === GPIOPinMode.Output) {
                            this.indicatorLightRedPin.requestOutputMode();
                        }
                        else {
                            this.indicatorLightRedPin.requestInputMode();
                        }

                        this.deviceMap.set(plcDeviceConfigKey, {
                            get: (): any => this.indicatorLightRedPin.getValue(),
                            set: (value: 0 | 1): void => this.indicatorLightRedPin.setValue(value)
                        });

                        break;

                    case 'indicatorLightDeviceYellow':
                        this.server.log.info({ tags: [ModuleName] }, `Initializing ${plcDeviceConfigKey} pin: ${plcDeviceConfigValue.pin}`);

                        this.indicatorLightYellowPin = new gpio.Line(this.bcm2835, Number(plcDeviceConfigValue.pin));
                        if (plcDeviceConfigValue.mode === GPIOPinMode.Output) {
                            this.indicatorLightYellowPin.requestOutputMode();
                        }
                        else {
                            this.indicatorLightYellowPin.requestInputMode();
                        }

                        this.deviceMap.set(plcDeviceConfigKey, {
                            get: () => this.indicatorLightYellowPin.getValue(),
                            set: (value: 0 | 1) => this.indicatorLightYellowPin.setValue(value)
                        });

                        break;

                    case 'indicatorLightDeviceGreen':
                        this.server.log.info({ tags: [ModuleName] }, `Initializing ${plcDeviceConfigKey} pin: ${plcDeviceConfigValue.pin}`);

                        this.indicatorLightGreenPin = new gpio.Line(this.bcm2835, Number(plcDeviceConfigValue.pin));
                        if (plcDeviceConfigValue.mode === GPIOPinMode.Output) {
                            this.indicatorLightGreenPin.requestOutputMode();
                        }
                        else {
                            this.indicatorLightGreenPin.requestInputMode();
                        }

                        this.deviceMap.set(plcDeviceConfigKey, {
                            get: () => this.indicatorLightGreenPin.getValue(),
                            set: (value: 0 | 1) => this.indicatorLightGreenPin.setValue(value)
                        });

                        break;

                    case 'tfLunaDevice':
                        this.server.log.info({ tags: [ModuleName] }, `Initializing tfLuna device serial port: ${plcDeviceConfigValue.serialPort}`);

                        this.serialPort = await this.openPort(this.plcDeviceConfig.tfLunaDevice.serialPort, this.plcDeviceConfig.tfLunaDevice.buadRate);

                        // await this.restoreTFLunaSettings();

                        await this.resetTFLuna();

                        await this.setTFLunaBaudRate();

                        // start with sampleRate === 0 to turn off sampling
                        await this.setTFLunaSampleRate(0);

                        await this.saveTFLunaSettings();

                        await this.getTFLunaVersion();

                        this.deviceMap.set(plcDeviceConfigKey, {
                            get: () => this.tfLunaStatus.measurement,
                            set: (_value: any) => void {}
                        });

                        if (plcDeviceConfigValue.autoStart) {
                            await this.startTFLunaMeasurement();
                        }

                        break;

                    default:
                        this.server.log.warn({ tags: [ModuleName] }, `Unknown plc device config: ${plcDeviceConfigKey}`);
                        break;
                }
            }

            setInterval(() => {
                void this.indicatorLightModeHandler();
            }, 500);
        }
        catch (ex) {
            this.server.log.error({ tags: [ModuleName] }, `Error during init: ${ex.message}`);
        }
    }

    public observe(observeTargets: ActiveObserveTargets): boolean {
        this.activeObserveTargets = {
            ...observeTargets
        };

        this.tfLunaResponseParser.observe(this.activeObserveTargets);

        return true;
    }

    public getIndicatorLightMode(): IndicatorLightMode {
        return this.indicatorLightMode;
    }

    public setIndicatorLightMode(mode: IndicatorLightMode): void {
        this.indicatorLightMode = mode;
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

    public async tfMeasurementControl(tfMeasurementaction: ITfMeasurementAction): Promise<void> {
        this.server.log.info({ tags: [ModuleName] }, `TFLuna measurement`);

        try {
            switch (tfMeasurementaction.action) {
                case TfMeasurementAction.Start:
                    await this.startTFLunaMeasurement();
                    break;

                case TfMeasurementAction.Stop:
                    await this.stopTFLunaMeasurement();
                    break;

                case TfMeasurementAction.Single:
                    this.getTFLunaMeasurement();
                    break;

                default:
                    this.server.log.info({ tags: [ModuleName] }, `TFLuna measurement action not recognized: ${tfMeasurementaction.action as string}`);
                    break;
            }
        }
        catch (ex) {
            this.server.log.error({ tags: [ModuleName] }, `Error during TFLuna measurement control: ${ex.message}`);
        }
    }

    public indicatorLightControl(lightAction: IIndicatorLightAction): boolean {
        let status = false;

        try {
            if (gpio.available()) {
                this.indicatorLightMode = IndicatorLightMode.MANUAL;

                this.indicatorLightRedPin.setValue(lightAction.ledRedState);
                this.indicatorLightYellowPin.setValue(lightAction.ledYellowState);
                this.indicatorLightGreenPin.setValue(lightAction.ledGreenState);

                status = true;
            }
            else {
                this.server.log.info({ tags: [ModuleName] }, `GPIO access is unavailable`);
            }
        }
        catch (ex) {
            this.server.log.error({ tags: [ModuleName] }, `Error during indicator light control: ${ex.message}`);
        }

        return status;
    }

    public indicatorLightModeControl(lightModeAction: IIndicatorLightModeAction): boolean {
        let status = false;

        try {
            if (gpio.available()) {
                this.indicatorLightMode = lightModeAction.mode;
                status = true;
            }
            else {
                this.server.log.info({ tags: [ModuleName] }, `GPIO access is unavailable`);
            }
        }
        catch (ex) {
            this.server.log.error({ tags: [ModuleName] }, `Error during indicator mode control: ${ex.message}`);
        }

        return status;
    }

    private indicatorLightModeHandler(): void {
        this.indicatorLightModeBlinkState = this.indicatorLightModeBlinkState ? 0 : 1;

        switch (this.indicatorLightMode) {
            case IndicatorLightMode.AUTO:
                if (this.tfLunaStatus.measurement < this.plcDeviceConfig.tfLunaDevice.dangerDistance) {
                    this.indicatorLightRedPin.setValue(1);
                    this.indicatorLightYellowPin.setValue(0);
                    this.indicatorLightGreenPin.setValue(0);
                }
                else if (this.tfLunaStatus.measurement > this.plcDeviceConfig.tfLunaDevice.warningDistance) {
                    this.indicatorLightRedPin.setValue(0);
                    this.indicatorLightYellowPin.setValue(0);
                    this.indicatorLightGreenPin.setValue(1);
                }
                else {
                    this.indicatorLightRedPin.setValue(0);
                    this.indicatorLightYellowPin.setValue(1);
                    this.indicatorLightGreenPin.setValue(0);
                }

                break;

            case IndicatorLightMode.GREEN:
                this.indicatorLightRedPin.setValue(0);
                this.indicatorLightYellowPin.setValue(0);
                this.indicatorLightGreenPin.setValue(1);
                break;

            case IndicatorLightMode.YELLOWFLASHING:
                this.indicatorLightRedPin.setValue(0);
                this.indicatorLightYellowPin.setValue(this.indicatorLightModeBlinkState ? 1 : 0);
                this.indicatorLightGreenPin.setValue(0);
                break;

            case IndicatorLightMode.REDFLASHING:
                this.indicatorLightRedPin.setValue(this.indicatorLightModeBlinkState ? 1 : 0);
                this.indicatorLightYellowPin.setValue(0);
                this.indicatorLightGreenPin.setValue(0);
                break;

            case IndicatorLightMode.MANUAL:
                break;

            default:
                this.server.log.warn({ tags: [ModuleName] }, `Unknown indicator mode: ${this.indicatorLightMode as string}`);
        }
    }

    private async startTFLunaMeasurement(): Promise<void> {
        this.indicatorLightMode = IndicatorLightMode.AUTO;

        await this.setTFLunaSampleRate(this.plcDeviceConfig.tfLunaDevice.sampleRate);

        // this.tfLunaMeasurementTimer = setInterval(async () => {
        //     await this.getTFLunaMeasurement();
        // }, 1000 / this.plcDeviceConfig.tfLunaDevice.sampleRate);
    }

    private async stopTFLunaMeasurement(): Promise<void> {
        this.indicatorLightMode = IndicatorLightMode.GREEN;

        await this.setTFLunaSampleRate(0);

        // if (this.tfLunaMeasurementTimer) {
        //     clearInterval(this.tfLunaMeasurementTimer);
        //     this.tfLunaMeasurementTimer = null;
        // }
    }

    private portError(err: Error): void {
        this.server.log.error({ tags: [ModuleName] }, `Serialport Error: ${err.message}`);
    }

    private portOpen(): void {
        this.server.log.info({ tags: [ModuleName] }, `Serialport open`);
    }

    private portClosed(): void {
        this.server.log.info({ tags: [ModuleName] }, `Serialport closed`);
    }

    private tfLunaResponseParserHandler(data: ITFLunaResponse): void {
        this.server.log.info({ tags: [ModuleName] }, `[### DEBUG]: tfLunaResponseParserHandler - data: ${JSON.stringify(data, null, 4)}`);

        const commandId = data?.commandId;
        if (commandId) {
            let responseMessage = '';

            switch (commandId) {
                case TFLunaRestoreDefaultSettingsCommand:
                    this.tfLunaStatus.restoreDefaultSettingsStatus = (data as ITFLunaRestoreDefaultSettingsResponse).status;

                    responseMessage = `Restore default settings: ${this.tfLunaStatus.restoreDefaultSettingsStatus}`;

                    this.deferredPromiseRestoreTFLunaSettings.resolve();

                    break;

                case TFLunaSaveCurrentSettingsCommand:
                    this.tfLunaStatus.saveCurrentSettingsStatus = (data as ITFLunaSaveCurrentSettingsResponse).status;

                    responseMessage = `Save current settings: ${this.tfLunaStatus.saveCurrentSettingsStatus}`;

                    this.deferredPromiseSaveTFLunaSettings.resolve();

                    break;

                case TFLunaSoftResetCommand:
                    this.tfLunaStatus.softResetStatus = (data as ITFLunaSoftResetResponse).status;

                    responseMessage = `Soft reset: ${this.tfLunaStatus.softResetStatus}`;

                    this.deferredPromiseSoftReset.resolve();

                    break;

                case TFLunaSetBaudRateCommand:
                    this.tfLunaStatus.baudRate = (data as ITFLunaBaudResponse).baudRate;

                    responseMessage = `Current baudRate: ${this.tfLunaStatus.baudRate}`;

                    this.deferredPromiseSetBaudRate.resolve();

                    break;

                case TFLunaSetSampleRateCommand:
                    this.tfLunaStatus.sampleRate = (data as ITFLunaSampleRateResponse).sampleRate;

                    responseMessage = `Set sample rate: ${this.tfLunaStatus.sampleRate}`;

                    this.deferredPromiseSetSampleRate.resolve();

                    break;

                case TFLunaGetVersionCommand:
                    this.tfLunaStatus.version = (data as ITFLunaVersionResponse).version;

                    responseMessage = `Get current version: ${this.tfLunaStatus.version}`;

                    this.deferredPromiseGetLunaVersion.resolve();

                    break;

                case TFLunaMeasurementCommand:
                    this.tfLunaStatus.measurement = (data as ITFLunaMeasureResponse).distCm;

                    if (this.activeObserveTargets[ObserveTarget.Measurements]) {
                        responseMessage = `Measurement: ${this.tfLunaStatus.measurement}`;
                    }

                    break;

                default:
                    responseMessage = `Unknown response: ${commandId}`;
                    break;
            }

            if (responseMessage) {
                this.server.log.info({ tags: [ModuleName] }, `[TFLunaResponse]: ${responseMessage}`);
            }
        }
        else {
            this.server.log.error({ tags: [ModuleName] }, `tfLunaResponseParserHandler received unknown response data...`);
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
        /* eslint-disable @typescript-eslint/no-unsafe-argument */
        port.on('error', this.portError.bind(this));
        port.on('open', this.portOpen.bind(this));
        port.on('close', this.portClosed.bind(this));

        this.tfLunaResponseParser = port.pipe(new TFLunaResponseParser({
            objectMode: true,
            highWaterMark: 1000
        }));
        this.tfLunaResponseParser.on('data', this.tfLunaResponseParserHandler.bind(this));
        /* eslint-enable @typescript-eslint/no-unsafe-argument */

        return new Promise((resolve, reject) => {
            port.open((err) => {
                if (err) {
                    return reject(err);
                }

                return resolve(port);
            });
        });
    }

    // private async restoreTFLunaSettings(): Promise<void> {
    //     this.server.log.info({ tags: [ModuleName] }, `[TFLunaRequest]: Restore default settings`);

    //     this.deferredPromiseRestoreTFLunaSettings = new DeferredPromise<void>();

    //     this.writeTFLunaCommand(Buffer.from(TFLunaRestoreDefaultSettingsPrefix.concat([0x00])));

    //     await this.deferredPromiseRestoreTFLunaSettings.promise;
    //     await sleep(2000);
    // }

    private async saveTFLunaSettings(): Promise<void> {
        this.server.log.info({ tags: [ModuleName] }, `[TFLunaRequest]: Save current settings`);

        this.deferredPromiseSaveTFLunaSettings = new DeferredPromise<void>();

        this.writeTFLunaCommand(Buffer.from(TFLunaSaveCurrentSettingsPrefix.concat([0x00])));

        await this.deferredPromiseSaveTFLunaSettings.promise;
        // await sleep(2000);
    }

    private async resetTFLuna(): Promise<void> {
        this.server.log.info({ tags: [ModuleName] }, `[TFLunaRequest]: Soft reset`);

        this.deferredPromiseSoftReset = new DeferredPromise<void>();

        this.writeTFLunaCommand(Buffer.from(TFLunaSoftResetPrefix.concat([0x00])));

        await this.deferredPromiseSoftReset.promise;
        // await sleep(5000);
    }

    private async setTFLunaBaudRate(baudRate = 115200): Promise<void> {
        this.server.log.info({ tags: [ModuleName] }, `[TFLunaRequest]: Set baud rate request with value: ${baudRate}`);

        this.server.log.info({ tags: [ModuleName] }, `[### DEBUG]: instantiate new deferredPromiseSetBaudRate`);
        this.deferredPromiseSetBaudRate = new DeferredPromise<void>();

        const data1 = (baudRate & 0xFF);
        const data2 = (baudRate & 0xFF00) >> 8;
        const data3 = (baudRate & 0x00FF0000) >> 16;
        const data4 = (baudRate & 0xFF000000) >> 24;

        this.server.log.info({ tags: [ModuleName] }, `[### DEBUG]: writing command`);
        this.writeTFLunaCommand(Buffer.from(TFLunaSetBaudRatePrefix.concat([data1, data2, data3, data4, 0x00])));

        this.server.log.info({ tags: [ModuleName] }, `[### DEBUG]: awaiting deferredPromiseSetBaudRate.promise`);
        await this.deferredPromiseSetBaudRate.promise;
        // await sleep(2000);
    }

    private async setTFLunaSampleRate(sampleRate: number): Promise<void> {
        this.server.log.info({ tags: [ModuleName] }, `[TFLunaRequest]: Set sample rate request with value: ${sampleRate}`);

        this.deferredPromiseSetSampleRate = new DeferredPromise<void>();

        this.writeTFLunaCommand(Buffer.from(TFLunaSetSampleRatePrefix.concat([sampleRate, 0x00, 0x00])));

        await this.deferredPromiseSetSampleRate.promise;
        // await sleep(2000);
    }

    private async getTFLunaVersion(): Promise<void> {
        this.server.log.info({ tags: [ModuleName] }, `[TFLunaRequest]: Get version request`);

        this.deferredPromiseGetLunaVersion = new DeferredPromise<void>();

        this.writeTFLunaCommand(Buffer.from(TFLunaGetVersionPrefix.concat([0x00])));

        await this.deferredPromiseGetLunaVersion.promise;
        // await sleep(2000);
    }

    private getTFLunaMeasurement(): void {
        if (this.tfLunaStatus.sampleRate === 0) {
            this.writeTFLunaCommand(Buffer.from(TFLunaMeasurementPrefix.concat([0x00])));
        }
    }

    private writeTFLunaCommand(writeData: Buffer): void {
        try {
            this.server.log.info({ tags: [ModuleName] }, `[### DEBUG]: starting write`);
            this.serialPort.write(writeData, (writeError: Error) => {
                if (writeError) {
                    this.server.log.error({ tags: [ModuleName] }, `Serial port write error: ${writeError.message}`);
                }

                this.server.log.info({ tags: [ModuleName] }, `[### DEBUG]: in write callback, now starting drain check`);
                this.serialPort.drain((drainError) => {
                    if (drainError) {
                        this.server.log.error({ tags: [ModuleName] }, `Serial port drain error: ${drainError.message}`);
                    }

                    this.server.log.info({ tags: [ModuleName] }, `[### DEBUG]: completed drain check`);
                });
            });
        }
        catch (ex) {
            this.server.log.error({ tags: [ModuleName] }, `Serial port write error: ${ex.message}`);
        }
    }
}
