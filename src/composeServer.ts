import fastify, {
    FastifyInstance,
    FastifyServerOptions
} from 'fastify';
import autoload from '@fastify/autoload';
import sensible from '@fastify/sensible';
import {
    join as pathJoin,
    resolve as pathResolve
} from 'path';
import * as fse from 'fs-extra';
import { IRpiPlcConfig } from './models/rpiPlcTypes';

const ModuleName = 'composeServer';
const RootConfig = 'rootConfig';

declare module 'fastify' {
    interface FastifyInstance {
        [RootConfig]: IRpiPlcConfig;
    }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface composeOptions extends FastifyServerOptions {
}

const composeServer = async (options: composeOptions = {}): Promise<FastifyInstance> => {
    try {
        const server = fastify(options);

        server.log.info({ tags: [ModuleName] }, `Composing server instance...`);

        const storageRoot = process.env.RPIPLC_SERVICE_STORAGE
            ? pathResolve(process.env.RPIPLC_SERVICE_STORAGE)
            : '/rpi-plc/data';

        const plcConfig = fse.readJsonSync(pathResolve(storageRoot, process.env.PLC_CONFIG_FILENAME ?? 'plcConfig.json'));
        const opcuaServerConfig = fse.readJSONSync(pathResolve(storageRoot, process.env.OPCUA_CONFIG_FILENAME ?? 'opcuaServerConfig.json'));

        server.decorate(RootConfig, {
            storageRoot,
            plcDeviceConfig: plcConfig,
            opcuaServerOptions: opcuaServerConfig.serverConfig,
            assetRootConfig: opcuaServerConfig.assetRootConfig
        });

        await server.register(sensible);

        // server.log.info({ tags: [ModuleName] }, `🚀 Adding shared schema`);
        server.log.warn({ tags: [ModuleName] }, `NEED TO ADD SHARED SCHEMA`);

        server.log.info({ tags: [ModuleName] }, `Registering services`);

        await server.register(autoload, {
            dir: pathJoin(__dirname, 'services')
        });

        server.log.info({ tags: [ModuleName] }, `Registering routes`);

        await server.register(autoload, {
            dir: pathJoin(__dirname, 'routes'),
            options: {
                prefix: '/api/v1'
            }
        });

        await server.ready();

        return Promise.resolve(server);
    }
    catch (ex) {
        throw new Error(`Failed to compose server instance: ${ex.message}`);
    }
};

export default composeServer;
