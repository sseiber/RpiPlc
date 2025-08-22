export {
    ObserveTarget,
    ActiveObserveTargets,
    ActiveObserveTargetsDefaults,
    IObserveRequest,
    IIndicatorLightAction,
    IndicatorLightMode,
    IIndicatorLightModeAction,
    TfMeasurementAction,
    ITfMeasurementAction,
    ControlRequestAction,
    IControlRequest,
    GPIOPinMode,
    IPlcGpioDeviceConfig,
    IPlcTfLunaDeviceConfig,
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
    TFLunaSoftResetPrefix,
    TFLunaGetVersionCommand,
    TFLunaGetVersionPrefix,
    TFLunaMeasurementPrefix,
    ITFLunaResponse,
    ITFLunaRestoreDefaultSettingsResponse,
    ITFLunaSaveCurrentSettingsResponse,
    ITFLunaSoftResetResponse,
    ITFLunaBaudResponse,
    ITFLunaSampleRateResponse,
    ITFLunaVersionResponse,
    ITFLunaMeasureResponse,
    TFLunaMeasurementCommand,
    IServiceResponse,
    IServiceErrorMessage,
    IServiceReply
} from './rpiPlcTypes.js';

import ActiveObserveTargetsSchema from './schemas/ActiveObserveTargetsSchema.json' with { type: 'json' };
import IObserveRequestSchema from './schemas/IObserveRequestSchema.json' with { type: 'json' };
import IControlRequestSchema from './schemas/IControlRequestSchema.json' with { type: 'json' };
import ITFLunaStatusSchema from './schemas/ITFLunaStatusSchema.json' with { type: 'json' };
import ITFLunaResponseSchema from './schemas/ITFLunaResponseSchema.json' with { type: 'json' };
import ITFLunaRestoreDefaultSettingsResponseSchema from './schemas/ITFLunaRestoreDefaultSettingsResponseSchema.json' with { type: 'json' };
import ITFLunaSaveCurrentSettingsResponseSchema from './schemas/ITFLunaSaveCurrentSettingsResponseSchema.json' with { type: 'json' };
import ITFLunaSoftResetResponseSchema from './schemas/ITFLunaSoftResetResponseSchema.json' with { type: 'json' };
import ITFLunaBaudResponseSchema from './schemas/ITFLunaBaudResponseSchema.json' with { type: 'json' };
import ITFLunaSampleRateResponseSchema from './schemas/ITFLunaSampleRateResponseSchema.json' with { type: 'json' };
import ITFLunaVersionResponseSchema from './schemas/ITFLunaVersionResponseSchema.json' with { type: 'json' };
import IServiceResponseSchema from './schemas/IServiceResponseSchema.json' with { type: 'json' };
import ITFLunaMeasureResponseSchema from './schemas/ITFLunaMeasureResponseSchema.json' with { type: 'json' };
import IServiceErrorMessageSchema from './schemas/IServiceErrorMessageSchema.json' with { type: 'json' };
export {
    ActiveObserveTargetsSchema,
    IObserveRequestSchema,
    IControlRequestSchema,
    ITFLunaStatusSchema,
    ITFLunaResponseSchema,
    ITFLunaRestoreDefaultSettingsResponseSchema,
    ITFLunaSaveCurrentSettingsResponseSchema,
    ITFLunaSoftResetResponseSchema,
    ITFLunaBaudResponseSchema,
    ITFLunaSampleRateResponseSchema,
    ITFLunaVersionResponseSchema,
    ITFLunaMeasureResponseSchema,
    IServiceResponseSchema,
    IServiceErrorMessageSchema
};
