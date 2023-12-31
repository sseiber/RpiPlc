import { OPCUAServerOptions } from 'node-opcua';
import { IAssetRootConfig } from './opcuaServerTypes';
export enum ObserveTarget {
    Measurements = 'measurements',
    ParserCommandResponse = 'parserCommandResponse'
}

export interface ActiveObserveTargets {
    [ObserveTarget.Measurements]: boolean;
    [ObserveTarget.ParserCommandResponse]: boolean;
}

export const ActiveObserveTargetsDefaults = {
    [ObserveTarget.Measurements]: false,
    [ObserveTarget.ParserCommandResponse]: false
};

export interface IObserveRequest {
    observeTargets: ActiveObserveTargets;
}

export interface IObserveResponse {
    succeeded: boolean;
    message: string;
    status: string;
}

export interface IRpiPlcConfig {
    storageRoot: string;
    plcDeviceConfig: IPlcDeviceConfig;
    serverConfig: OPCUAServerOptions;
    assetRootConfig: IAssetRootConfig;
}

export const enum GPIOPinMode {
    Input = 'INPUT',
    Output = 'OUTPUT'
}

export interface IPlcGpioDeviceConfig {
    pin: number;
    mode: GPIOPinMode;
}

export interface IPlcTfLunaDeviceConfig {
    deviceId: string;
    serialPort: string;
    buadRate: number;
    sampleRate: number;
    warningDistance: number;
    dangerDistance: number;
    autoStart: boolean;
}

export interface IPlcDeviceConfig {
    indicatorLightDeviceRed: IPlcGpioDeviceConfig;
    indicatorLightDeviceYellow: IPlcGpioDeviceConfig;
    indicatorLightDeviceGreen: IPlcGpioDeviceConfig;
    tfLunaDevice: IPlcTfLunaDeviceConfig;
}

export const enum GPIOState {
    Low = 0,
    High = 1
}

export interface IIndicatorLightAction {
    ledRedState: GPIOState;
    ledYellowState: GPIOState;
    ledGreenState: GPIOState;
}

export const enum IndicatorLightMode {
    AUTO = 'AUTO',
    GREEN = 'GREEN',
    YELLOWFLASHING = 'YELLOWFLASHING',
    REDFLASHING = 'REDFLASHING',
    MANUAL = 'MANUAL'
}

export interface IIndicatorLightModeAction {
    mode: IndicatorLightMode;
}

export const enum TfMeasurementAction {
    Start = 'START',
    Stop = 'STOP',
    Single = 'SINGLE'
}

export interface ITfMeasurementAction {
    action: TfMeasurementAction;
}

export enum RpiPlcRequestAction {
    IndicatorLight = 'INDICATORLIGHT',
    IndicatorMode = 'INDICATORMODE',
    TfMeasurement = 'MEASUREMENT',
}

export interface IRpiPlcServiceRequest {
    action: RpiPlcRequestAction;
    data?: any;
}

export interface IRpiPlcServiceResponse {
    succeeded: boolean;
    message: string;
    status: any;
}

export interface ITFLunaStatus {
    restoreDefaultSettingsStatus: number;
    saveCurrentSettingsStatus: number;
    baudRate: number;
    sampleRate: number;
    version: string;
    measurement: number;
}

export const TFLunaCommandHeader = [0x5A];
export const TFLunaMeasureHeader = [0x59, 0x59];
export const TFLunaRestoreDefaultSettingsCommand = 0x10;
export const TFLunaRestoreDefaultSettingsPrefix = [0x5A, 0x04, TFLunaRestoreDefaultSettingsCommand];
export const TFLunaSaveCurrentSettingsCommand = 0x11;
export const TFLunaSaveCurrentSettingsPrefix = [0x5A, 0x04, TFLunaSaveCurrentSettingsCommand];
export const TFLunaSoftResetCommand = 0x02;
export const TFLunaSoftResetPrefix = [0x5A, 0x04, TFLunaSoftResetCommand];
export const TFLunaSetBaudRateCommand = 0x06;
export const TFLunaSetBaudRatePrefix = [0x5A, 0x08, TFLunaSetBaudRateCommand];
export const TFLunaSetSampleRateCommand = 0x03;
export const TFLunaSetSampleRatePrefix = [0x5A, 0x06, TFLunaSetSampleRateCommand];
export const TFLunaGetVersionCommand = 0x01;
export const TFLunaGetVersionPrefix = [0x5A, 0x04, TFLunaGetVersionCommand];
export const TFLunaMeasurementCommand = 0x04;
export const TFLunaMeasurementPrefix = [0x5A, 0x04, TFLunaMeasurementCommand];

export interface ITFLunaResponse {
    commandId: number;
}

export interface ITFLunaRestoreDefaultSettingsResponse extends ITFLunaResponse {
    status: number;
}

export interface ITFLunaSaveCurrentSettingsResponse extends ITFLunaResponse {
    status: number;
}

export interface ITFLunaSoftResetResponse extends ITFLunaResponse {
    status: number;
}

export interface ITFLunaBaudResponse extends ITFLunaResponse {
    baudRate: number;
}

export interface ITFLunaSampleRateResponse extends ITFLunaResponse {
    sampleRate: number;
}

export interface ITFLunaVersionResponse extends ITFLunaResponse {
    version: string;
}

export interface ITFLunaMeasureResponse extends ITFLunaResponse {
    distCm: number;
    amp: number;
    tempC: string;
    seq: number;
}
