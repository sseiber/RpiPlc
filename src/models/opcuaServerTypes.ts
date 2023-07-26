import {
    DataValue,
    UAObject,
    UAVariable
} from 'node-opcua';

export interface IOpcAssetInfo {
    asset: UAObject;
    variablesMap: Map<string, IOpcVariable>;
}

export interface IOpcVariable {
    variable: UAVariable;
    sampleInterval: number;
    value: DataValue;
}

export interface IAssetTag {
    browseName: string;
    displayName: string;
    description: string;
    sampleInterval: number;
    dataTypeName: string;
    value: any;
    writeable?: boolean;
}

export interface IAssetConfig {
    name: string;
    tags: IAssetTag[];
}

export interface IAssetRootConfig {
    rootFolderName: string;
    assets: IAssetConfig[];
}
