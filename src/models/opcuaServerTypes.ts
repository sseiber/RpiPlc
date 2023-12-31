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

export interface IAssetNode {
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
    nodes: IAssetNode[];
}

export interface IMethodInputArgumentConfig {
    name: string;
    description: string;
    dataTypeName: string;
}

export interface IMethodOutputArgumentConfig {
    name: string;
    description: string;
    dataTypeName: string;
}

export interface IMethodConfig {
    browseName: string;
    displayName: string;
    description: string;
    inputArguments: IMethodInputArgumentConfig[];
    outputArguments: IMethodOutputArgumentConfig[];
}

export interface IAssetRootConfig {
    rootFolderName: string;
    assets: IAssetConfig[];
    methods: IMethodConfig[];
}
