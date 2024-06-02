import fastify, {
    FastifyInstance,
    FastifyServerOptions
} from 'fastify';
import autoload from '@fastify/autoload';
import sensible from '@fastify/sensible';
import { join as pathJoin } from 'path';

// import {
//     ITFLunaResponse,
// } from './models/tfLunaTypes';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface composeOptions extends FastifyServerOptions {
}

const ModuleName = 'ComposeServer';

const composeServer = async (options: composeOptions = {}): Promise<FastifyInstance> => {
    try {
        const server = fastify(options);

        server.log.info({ tags: [ModuleName] }, `Composing server instance...`);

        await server.register(sensible);

        // server.log.info({ tags: [ModuleName] }, `🚀 Adding shared schema`);
        server.log.warn({ tags: [ModuleName] }, `NEED TO ADD SHARED SCHEMA`);

        // server.addSchema(ITFLunaResponse);

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
