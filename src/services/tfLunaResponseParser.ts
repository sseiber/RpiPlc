import {
    Transform,
    TransformCallback,
    TransformOptions
} from 'stream';
import {
    ObserveTarget,
    ActiveObserveTargets,
    ActiveObserveTargetsDefaults,
    TFLunaCommandHeader,
    TFLunaMeasureHeader,
    TFLunaRestoreDefaultSettingsCommand,
    TFLunaSaveCurrentSettingsCommand,
    TFLunaSoftResetCommand,
    TFLunaSetBaudRateCommand,
    TFLunaSetSampleRateCommand,
    TFLunaGetVersionCommand,
    TFLunaMeasurementCommand,
    ITFLunaRestoreDefaultSettingsResponse,
    ITFLunaSaveCurrentSettingsResponse,
    ITFLunaSoftResetResponse,
    ITFLunaBaudResponse,
    ITFLunaSampleRateResponse,
    ITFLunaMeasureResponse,
    ITFLunaVersionResponse
} from '../models/rpiPlcTypes';

const ModuleName = 'TFLunaResponseParser';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface TFLunaResponseOptions extends TransformOptions {
}

export class TFLunaResponseParser extends Transform {
    private activeObserveTargets: ActiveObserveTargets;
    private buffer: Buffer;
    private measurementSequence = 0;

    constructor({ ...options }: TFLunaResponseOptions) {
        super(options);

        this.activeObserveTargets = {
            ...ActiveObserveTargetsDefaults
        };
        this.buffer = Buffer.alloc(0);
    }

    public observe(observeTargets: ActiveObserveTargets): string {
        this.activeObserveTargets = {
            ...observeTargets
        };

        return 'OK';
    }

    public _transform(chunk: Buffer, _encoding: BufferEncoding, cb: TransformCallback): void {
        let data = Buffer.concat([this.buffer, chunk]);
        let header;
        let length;
        let commandId;
        let checksum;
        let tfResponse: any = {};

        while (data.length >= 2) {
            if (Buffer.compare(data.subarray(0, 1), Buffer.from(TFLunaCommandHeader)) === 0) {
                header = data.readUInt8(0);
                length = data.readUInt8(1);
                commandId = data.readUInt8(2);
                checksum = data.readUInt8(data.length - 1);

                this.tfLog([ModuleName, 'debug'], `hdr: ${header}, len: ${length}, cmd: ${commandId}, chk: ${checksum}`);

                switch (commandId) {
                    case TFLunaRestoreDefaultSettingsCommand:
                        tfResponse = this.parseRestoreDefaultSettingsResponse(commandId, data);
                        break;

                    case TFLunaSaveCurrentSettingsCommand:
                        tfResponse = this.parseSaveCurrentSettingsResponse(commandId, data);
                        break;

                    case TFLunaSoftResetCommand:
                        tfResponse = this.parseSoftResetResponse(commandId, data);
                        break;

                    case TFLunaSetBaudRateCommand:
                        tfResponse = this.parseSetBaudRateResponse(commandId, data);
                        break;

                    case TFLunaSetSampleRateCommand:
                        tfResponse = this.parseSetSampleRateResponse(commandId, data);
                        break;

                    case TFLunaGetVersionCommand:
                        tfResponse = this.parseGetVersionResponse(commandId, data);
                        break;

                    default:
                        this.tfLog([ModuleName, 'debug'], `Unknown response data returned: ${commandId}`);
                        break;
                }
            }
            else if (Buffer.compare(data.subarray(0, 2), Buffer.from(TFLunaMeasureHeader)) === 0) {
                header = data.readUInt16BE(0);
                length = 9;
                commandId = TFLunaMeasurementCommand;
                checksum = data.readUInt8(data.length - 1);

                tfResponse = this.parseTriggerResponse(commandId, data);
            }

            this.push(tfResponse);
            data = data.subarray(length);
        }

        this.buffer = data;

        this.tfLog([ModuleName, 'debug'], `In _transform: length: ${this.readableLength}, buffer: ${this.buffer.toString('hex')}`);

        return cb();
    }

    public _flush(cb: TransformCallback): void {
        this.push(this.buffer);
        this.buffer = Buffer.alloc(0);

        this.tfLog([ModuleName, 'debug'], `In _flush: length: ${this.readableLength}, buffer: ${this.buffer.toString('hex')}`);

        return cb();
    }

    private parseRestoreDefaultSettingsResponse(commandId: number, data: Buffer): ITFLunaRestoreDefaultSettingsResponse {
        const status = data.readUInt8(3);

        this.tfLog([ModuleName, 'debug'], `Restore default settings status: ${status}`);

        return {
            commandId,
            status
        };
    }

    private parseSaveCurrentSettingsResponse(commandId: number, data: Buffer): ITFLunaSaveCurrentSettingsResponse {
        const status = data.readUInt8(3);

        this.tfLog([ModuleName, 'debug'], `Save current settings status: ${status}`);

        return {
            commandId,
            status
        };
    }

    private parseSoftResetResponse(commandId: number, data: Buffer): ITFLunaSoftResetResponse {
        const status = data.readUInt8(3);

        this.tfLog([ModuleName, 'debug'], `Soft reset status: ${status}`);

        return {
            commandId,
            status
        };
    }

    private parseSetBaudRateResponse(commandId: number, data: Buffer): ITFLunaBaudResponse {
        // eslint-disable-next-line no-bitwise
        const baudRate = ((data.readUInt8(6) << 24) + (data.readUInt8(5) << 16)) + ((data.readUInt8(4) << 8) + (data.readUInt8(3)));

        this.tfLog([ModuleName, 'debug'], `baudRate: ${baudRate}`);

        return {
            commandId,
            baudRate
        };
    }

    private parseSetSampleRateResponse(commandId: number, data: Buffer): ITFLunaSampleRateResponse {
        // eslint-disable-next-line no-bitwise
        const sampleRate = (data.readUInt8(4) << 8) + data.readUInt8(3);

        this.tfLog([ModuleName, 'debug'], `sampleRate: ${sampleRate}`);

        return {
            commandId,
            sampleRate
        };
    }

    private parseGetVersionResponse(commandId: number, data: Buffer): ITFLunaVersionResponse {
        // const version = `${data.toString('utf8', 21, 23)}.${data.toString('utf8', 24, 26)}.${data.toString('utf8', 27, 29)}`;
        const version = `${data.readUInt8(3)}.${data.readUInt8(4)}.${data.readUInt8(5)}`;

        this.tfLog([ModuleName, 'debug'], `vers: ${version}`);

        return {
            commandId,
            version
        };
    }

    private parseTriggerResponse(commandId: number, data: Buffer): ITFLunaMeasureResponse {
        const seq = this.measurementSequence++;
        const amp = data.readUInt16LE(4);
        const distCm = (amp <= 100 || amp === 65535) ? 0 : data.readUInt16LE(2);
        const tempCt = data.readUInt16LE(6);
        const tempC = tempCt ? (tempCt / 8) - 256 : 0;

        this.tfLog([ModuleName, 'debug'], `seq: ${seq}, trig: distCm ${distCm}, amp ${amp}, tempC ${tempC}`);

        return {
            commandId,
            distCm,
            amp,
            tempC: tempC.toString(),
            seq
        };
    }

    private tfLog(tags: any, message: any) {
        if (!this.activeObserveTargets[ObserveTarget.ParserCommandResponse]) {
            return;
        }

        const tagsMessage = (tags && Array.isArray(tags)) ? `[${tags.join(', ')}]` : '[]';

        // eslint-disable-next-line no-console
        console.log(`[${new Date().toTimeString()}] [${tagsMessage}] ${message}`);
    }
}
