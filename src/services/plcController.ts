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
    ITFLunaSoftResetResponse,
    IPlcGpioDeviceConfig,
    TFLunaRestoreDefaultSettingsPrefix
} from '../models/rpiPlcTypes.js';
import { SerialPort } from 'serialport';
import { TFLunaResponseParser } from './tfLunaResponseParser.js';
import {
    version as gpioVersion,
    Chip,
    Line
} from 'node-libgpiod';
import { exMessage, sleep } from '../utils/index.js';

const ServiceName = 'plcController';

enum DeferredPromiseReason {
    RestoreTFLunaSettings = 'RestoreTFLunaSettings',
    SaveTFLunaSettings = 'SaveTFLunaSettings',
    SoftReset = 'SoftReset',
    SetBaudRate = 'SetBaudRate',
    SetSampleRate = 'SetSampleRate',
    GetLunaVersion = 'GetLunaVersion'
}

export class PlcController {
    public static createPlcController(server: FastifyInstance, plcDeviceConfig: IPlcDeviceConfig): PlcController {
        server.log.info({ tags: [ServiceName] }, `Initializing plcController`);

        const bcm2835 = new Chip(0);
        if (!bcm2835) {
            throw new Error('Failed to initialize BCM2835');
        }

        server.log.info({ tags: [ServiceName] }, `Initializing gpio ${bcm2835.name} - libgpiod version: ${gpioVersion}`);

        const indicatorLightRedPin = this.createIndicatorLightPin(bcm2835, plcDeviceConfig.indicatorLightDeviceRed);
        const indicatorLightYellowPin = this.createIndicatorLightPin(bcm2835, plcDeviceConfig.indicatorLightDeviceYellow);
        const indicatorLightGreenPin = this.createIndicatorLightPin(bcm2835, plcDeviceConfig.indicatorLightDeviceGreen);

        return new PlcController(
            server,
            plcDeviceConfig,
            bcm2835,
            indicatorLightRedPin,
            indicatorLightYellowPin,
            indicatorLightGreenPin
        );
    }

    private static createIndicatorLightPin(bcm2835: Chip, pinConfig: IPlcGpioDeviceConfig): Line {
        const line = new Line(bcm2835, pinConfig.pin);
        if (pinConfig.mode === GPIOPinMode.Output) {
            line.requestOutputMode();
        }
        else {
            line.requestInputMode();
        }
        return line;
    }

    private server: FastifyInstance;
    private activeObserveTargets: ActiveObserveTargets;
    private bcm2835: Chip;
    private indicatorLightRedPin: Line;
    private indicatorLightYellowPin: Line;
    private indicatorLightGreenPin: Line;

    private indicatorLightMode: IndicatorLightMode = IndicatorLightMode.GREEN;
    private indicatorLightModeBlinkState = 0;

    private plcDeviceConfig: IPlcDeviceConfig;
    private serialPort: SerialPort | null = null;
    private tfLunaResponseParser: TFLunaResponseParser | null = null;
    private tfLunaStatus: ITFLunaStatus;
    private mapResolvers = new Map<DeferredPromiseReason, PromiseWithResolvers<void>>();
    // private tfLunaMeasurementTimer: NodeJS.Timeout;

    constructor(
        server: FastifyInstance,
        plcDeviceConfig: IPlcDeviceConfig,
        bcm2835: Chip,
        indicatorLightRedPin: Line,
        indicatorLightYellowPin: Line,
        indicatorLightGreenPin: Line
    ) {
        this.server = server;
        this.plcDeviceConfig = plcDeviceConfig;
        this.bcm2835 = bcm2835;
        this.indicatorLightRedPin = indicatorLightRedPin;
        this.indicatorLightYellowPin = indicatorLightYellowPin;
        this.indicatorLightGreenPin = indicatorLightGreenPin;

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
        this.server.log.info({ tags: [ServiceName] }, `${ServiceName} initialization`);
        this.server.log.info({ tags: [ServiceName] }, `Initializing gpio ${this.bcm2835.name} - libgpiod version: ${gpioVersion}`);

        try {
            this.server.log.info({ tags: [ServiceName] }, `Initializing plc controller`);
            this.server.log.info({ tags: [ServiceName] }, `Initializing gpio ${this.bcm2835.name} - libgpiod version: ${gpioVersion}`);

            this.server.log.info({ tags: [ServiceName] }, `Initializing tfLuna device`);

            this.serialPort = await this.openPort(this.plcDeviceConfig.tfLunaDevice.serialPort, this.plcDeviceConfig.tfLunaDevice.buadRate);

            // await this.restoreTFLunaSettings();

            await this.resetTFLuna();

            await this.setTFLunaBaudRate();

            // start with sampleRate === 0 to turn off sampling
            await this.setTFLunaSampleRate(0);

            await this.saveTFLunaSettings();

            await this.getTFLunaVersion();

            if (this.plcDeviceConfig.tfLunaDevice.autoStart) {
                this.server.log.info({ tags: [ServiceName] }, `Auto-start feature is set - starting TFLuna measurement...`);

                await this.startTFLunaMeasurement();
            }

            setInterval(() => {
                this.indicatorLightModeHandler();
            }, 500);
        }
        catch (ex) {
            this.server.log.error({ tags: [ServiceName] }, `Error during init: ${exMessage(ex)}`);
        }
    }

    public observe(observeTargets: ActiveObserveTargets): boolean {
        this.activeObserveTargets = {
            ...observeTargets
        };

        if (this.tfLunaResponseParser) {
            this.tfLunaResponseParser.observe(this.activeObserveTargets);
        }

        return true;
    }

    public getIndicatorLightMode(): IndicatorLightMode {
        return this.indicatorLightMode;
    }

    public setIndicatorLightMode(mode: IndicatorLightMode): void {
        this.indicatorLightMode = mode;
    }

    public async tfMeasurementControl(tfMeasurementaction: ITfMeasurementAction): Promise<void> {
        this.server.log.info({ tags: [ServiceName] }, `TFLuna measurement`);

        try {
            switch (tfMeasurementaction.action) {
                case TfMeasurementAction.Start:
                    await this.startTFLunaMeasurement();
                    break;

                case TfMeasurementAction.Stop:
                    await this.stopTFLunaMeasurement();
                    break;

                case TfMeasurementAction.Single:
                    await this.getTFLunaMeasurement();
                    break;

                default:
                    this.server.log.info({ tags: [ServiceName] }, `TFLuna measurement action not recognized: ${tfMeasurementaction.action as string}`);
                    break;
            }
        }
        catch (ex) {
            this.server.log.error({ tags: [ServiceName] }, `Error during TFLuna measurement control: ${exMessage(ex)}`);
        }
    }

    public indicatorLightControl(lightAction: IIndicatorLightAction): boolean {
        let status = false;

        try {
            this.indicatorLightMode = IndicatorLightMode.MANUAL;

            this.indicatorLightRedPin.setValue(lightAction.ledRedState);
            this.indicatorLightYellowPin.setValue(lightAction.ledYellowState);
            this.indicatorLightGreenPin.setValue(lightAction.ledGreenState);

            status = true;
        }
        catch (ex) {
            this.server.log.error({ tags: [ServiceName] }, `Error during indicator light control: ${exMessage(ex)}`);
        }

        return status;
    }

    public indicatorLightModeControl(lightModeAction: IIndicatorLightModeAction): boolean {
        let status = false;

        try {
            this.indicatorLightMode = lightModeAction.mode;
            status = true;
        }
        catch (ex) {
            this.server.log.error({ tags: [ServiceName] }, `Error during indicator mode control: ${exMessage(ex)}`);
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
                this.server.log.warn({ tags: [ServiceName] }, `Unknown indicator mode: ${this.indicatorLightMode as string}`);
        }
    }

    private async startTFLunaMeasurement(): Promise<void> {
        this.server.log.info({ tags: [ServiceName] }, `startTFLunaMeasurement start`);

        this.indicatorLightMode = IndicatorLightMode.AUTO;

        try {
            await this.setTFLunaSampleRate(this.plcDeviceConfig.tfLunaDevice.sampleRate);
        }
        catch (ex) {
            this.server.log.error({ tags: [ServiceName] }, `Error starting TFLuna measurement: ${exMessage(ex)}`);
        }
    }

    public async stopTFLunaMeasurement(): Promise<void> {
        this.server.log.info({ tags: [ServiceName] }, `startTFLunaMeasurement stop`);

        try {
            await this.setTFLunaSampleRate(0);
        }
        catch (ex) {
            this.server.log.error({ tags: [ServiceName] }, `Error during stop measurement: ${(ex as Error).message}`);
        }
    }

    private portError(err: Error): void {
        this.server.log.error({ tags: [ServiceName] }, `Serialport Error: ${err.message}`);
    }

    private portOpen(): void {
        this.server.log.info({ tags: [ServiceName] }, `Serialport open`);
    }

    private portClosed(): void {
        this.server.log.info({ tags: [ServiceName] }, `Serialport closed`);
    }

    private tfLunaResponseParserHandler(data: ITFLunaResponse): void {
        // this.server.log.info({ tags: [ServiceName] }, `[### DEBUG]: tfLunaResponseParserHandler - data: ${JSON.stringify(data, null, 4)}`);

        const commandId = data?.commandId;
        if (commandId) {
            let responseMessage = '';

            switch (commandId) {
                case TFLunaRestoreDefaultSettingsCommand:
                    this.tfLunaStatus.restoreDefaultSettingsStatus = (data as ITFLunaRestoreDefaultSettingsResponse).status;

                    responseMessage = `Restore default settings: ${this.tfLunaStatus.restoreDefaultSettingsStatus}`;

                    this.mapResolvers.get(DeferredPromiseReason.RestoreTFLunaSettings)?.resolve();

                    break;

                case TFLunaSaveCurrentSettingsCommand:
                    this.tfLunaStatus.saveCurrentSettingsStatus = (data as ITFLunaSaveCurrentSettingsResponse).status;

                    responseMessage = `Save current settings: ${this.tfLunaStatus.saveCurrentSettingsStatus}`;

                    this.mapResolvers.get(DeferredPromiseReason.SaveTFLunaSettings)?.resolve();

                    break;

                case TFLunaSoftResetCommand:
                    this.tfLunaStatus.softResetStatus = (data as ITFLunaSoftResetResponse).status;

                    responseMessage = `Soft reset: ${this.tfLunaStatus.softResetStatus}`;

                    this.mapResolvers.get(DeferredPromiseReason.SoftReset)?.resolve();

                    break;

                case TFLunaSetBaudRateCommand:
                    this.tfLunaStatus.baudRate = (data as ITFLunaBaudResponse).baudRate;

                    responseMessage = `Current baudRate: ${this.tfLunaStatus.baudRate}`;

                    this.mapResolvers.get(DeferredPromiseReason.SetBaudRate)?.resolve();

                    break;

                case TFLunaSetSampleRateCommand:
                    this.tfLunaStatus.sampleRate = (data as ITFLunaSampleRateResponse).sampleRate;

                    responseMessage = `Set sample rate: ${this.tfLunaStatus.sampleRate}`;

                    this.mapResolvers.get(DeferredPromiseReason.SetSampleRate)?.resolve();

                    break;

                case TFLunaGetVersionCommand:
                    this.tfLunaStatus.version = (data as ITFLunaVersionResponse).version;

                    responseMessage = `Get current version: ${this.tfLunaStatus.version}`;

                    this.mapResolvers.get(DeferredPromiseReason.GetLunaVersion)?.resolve();

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
                this.server.log.info({ tags: [ServiceName, 'TFLunaResponse'] }, `${responseMessage}`);
            }
        }
        else {
            this.server.log.error({ tags: [ServiceName] }, `tfLunaResponseParserHandler received unknown response data...`);
        }
    }

    private async openPort(device: string, baudRate: number): Promise<SerialPort> {
        const serialPort = new SerialPort({
            path: device,
            baudRate,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            autoOpen: false
        });

        serialPort.on('error', this.portError.bind(this));
        serialPort.on('open', this.portOpen.bind(this));
        serialPort.on('close', this.portClosed.bind(this));

        this.tfLunaResponseParser = serialPort.pipe<TFLunaResponseParser>(new TFLunaResponseParser({
            objectMode: true,
            highWaterMark: 1000
        }));

        if (!this.tfLunaResponseParser) {
            throw new Error('Failed to create TFLunaResponseParser');
        }

        this.tfLunaResponseParser.on('data', this.tfLunaResponseParserHandler.bind(this));

        return new Promise((resolve, reject) => {
            serialPort.open((err) => {
                if (err) {
                    return reject(err);
                }

                return resolve(serialPort);
            });
        });
    }

    // @ts-expect-error (future control method)
    private async restoreTFLunaSettings(): Promise<void> {
        this.server.log.info({ tags: [ServiceName, 'TFLunaRequest'] }, `Restore default settings`);

        try {
            const resolver = Promise.withResolvers<void>();
            this.mapResolvers.set(DeferredPromiseReason.RestoreTFLunaSettings, resolver);

            await this.writeTFLunaCommand(Buffer.from(TFLunaRestoreDefaultSettingsPrefix.concat([0x00])));

            await resolver.promise;
        }
        catch (ex) {
            this.server.log.error({ tags: [ServiceName] }, `Error during restoreTFLunaSettings: ${exMessage(ex)}`);
        }
        finally {
            this.mapResolvers.delete(DeferredPromiseReason.RestoreTFLunaSettings);

            this.server.log.info({ tags: [ServiceName] }, `Waiting for 2s to allow reset to complete...`);
            await sleep(2000);
        }
    }

    private async saveTFLunaSettings(): Promise<void> {
        this.server.log.info({ tags: [ServiceName, 'TFLunaRequest'] }, `Save current settings`);

        try {
            const resolver = Promise.withResolvers<void>();
            this.mapResolvers.set(DeferredPromiseReason.SaveTFLunaSettings, resolver);

            await this.writeTFLunaCommand(Buffer.from(TFLunaSaveCurrentSettingsPrefix.concat([0x00])));

            await resolver.promise;
        }
        catch (ex) {
            this.server.log.error({ tags: [ServiceName] }, `Error during saveTFLunaSettings: ${exMessage(ex)}`);
        }
        finally {
            this.mapResolvers.delete(DeferredPromiseReason.SaveTFLunaSettings);
        }
    }

    private async resetTFLuna(): Promise<void> {
        this.server.log.info({ tags: [ServiceName, 'TFLunaRequest'] }, `Soft reset`);

        try {
            const resolver = Promise.withResolvers<void>();
            this.mapResolvers.set(DeferredPromiseReason.SoftReset, resolver);

            await this.writeTFLunaCommand(Buffer.from(TFLunaSoftResetPrefix.concat([0x00])));

            await resolver.promise;
        }
        catch (ex) {
            this.server.log.error({ tags: [ServiceName] }, `Error during resetTFLuna: ${exMessage(ex)}`);
        }
        finally {
            this.mapResolvers.delete(DeferredPromiseReason.SoftReset);

            this.server.log.info({ tags: [ServiceName] }, `Waiting for 5s to allow reset to complete...`);
            await sleep(5000);
        }
    }

    private async setTFLunaBaudRate(baudRate = 115200): Promise<void> {
        this.server.log.info({ tags: [ServiceName, 'TFLunaRequest'] }, `Set baud rate request with value: ${baudRate}`);

        try {
            const resolver = Promise.withResolvers<void>();
            this.mapResolvers.set(DeferredPromiseReason.SetBaudRate, resolver);

            const data1 = (baudRate & 0xFF);
            const data2 = (baudRate & 0xFF00) >> 8;
            const data3 = (baudRate & 0x00FF0000) >> 16;
            const data4 = (baudRate & 0xFF000000) >> 24;

            await this.writeTFLunaCommand(Buffer.from(TFLunaSetBaudRatePrefix.concat([data1, data2, data3, data4, 0x00])));

            await resolver.promise;
        }
        catch (ex) {
            this.server.log.error({ tags: [ServiceName] }, `Error during setTFLunaBaudRate: ${exMessage(ex)}`);
        }
        finally {
            this.mapResolvers.delete(DeferredPromiseReason.SetBaudRate);
        }
    }

    private async setTFLunaSampleRate(sampleRate: number): Promise<void> {
        this.server.log.info({ tags: [ServiceName, 'TFLunaRequest'] }, `Set sample rate request with value: ${sampleRate}`);

        try {
            const resolver = Promise.withResolvers<void>();
            this.mapResolvers.set(DeferredPromiseReason.SetSampleRate, resolver);

            await this.writeTFLunaCommand(Buffer.from(TFLunaSetSampleRatePrefix.concat([sampleRate, 0x00, 0x00])));

            await resolver.promise;
        }
        catch (ex) {
            this.server.log.error({ tags: [ServiceName] }, `Error during setTFLunaSampleRate: ${exMessage(ex)}`);
        }
        finally {
            this.mapResolvers.delete(DeferredPromiseReason.SetSampleRate);
        }
    }

    private async getTFLunaVersion(): Promise<void> {
        this.server.log.info({ tags: [ServiceName, 'TFLunaRequest'] }, `Get version request`);

        try {
            const resolver = Promise.withResolvers<void>();
            this.mapResolvers.set(DeferredPromiseReason.GetLunaVersion, resolver);

            await this.writeTFLunaCommand(Buffer.from(TFLunaGetVersionPrefix.concat([0x00])));

            await resolver.promise;
        }
        catch (ex) {
            this.server.log.error({ tags: [ServiceName] }, `Error during getTFLunaVersion: ${exMessage(ex)}`);
        }
        finally {
            this.mapResolvers.delete(DeferredPromiseReason.GetLunaVersion);
        }
    }

    private async getTFLunaMeasurement(): Promise<void> {
        if (this.tfLunaStatus.sampleRate === 0) {
            await this.writeTFLunaCommand(Buffer.from(TFLunaMeasurementPrefix.concat([0x00])));
        }
    }

    private async writeTFLunaCommand(writeData: Buffer): Promise<void> {
        try {
            await new Promise<void>((resolve, reject) => {
                this.serialPort?.write(writeData, (writeError) => {
                    if (writeError) {
                        this.server.log.error({ tags: [ServiceName] }, `Serial port write error: ${writeError.message}`);

                        return reject(writeError);
                    }

                    this.serialPort?.drain((drainError) => {
                        if (drainError) {
                            this.server.log.error({ tags: [ServiceName] }, `Serial port drain error: ${drainError.message}`);

                            return reject(drainError);
                        }

                        return resolve();
                    });
                });
            });
        }
        catch (ex) {
            this.server.log.error({ tags: [ServiceName] }, `Serial port write error: ${exMessage(ex)}`);
        }
    }
}
