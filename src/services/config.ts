import {
    envSchema,
    JSONSchemaType
} from 'env-schema';
import {
    FastifyInstance,
    FastifyPluginAsync
} from 'fastify';
import fp from 'fastify-plugin';
import { resolve as pathResolve } from 'path';

const ServiceName = 'config';

interface IRpiPlcEnv {
    NODE_ENV: string;
    LOG_LEVEL: string;
    PORT: string;
    azureAiCluResource: string;
    azureAiCluProjectName: string;
    azureAiCluDeploymentName: string;
    azureAiCluQueryUrl: string;
    azureAiCluQueryApiVersion: string;
    azureAiCluApiKey: string;
}

const configSchema: JSONSchemaType<IRpiPlcEnv> = {
    type: 'object',
    properties: {
        NODE_ENV: {
            type: 'string',
            default: 'development'
        },
        LOG_LEVEL: {
            type: 'string',
            default: 'info'
        },
        PORT: {
            type: 'string',
            default: '9091'
        },
        azureAiCluResource: {
            type: 'string',
            default: ''
        },
        azureAiCluProjectName: {
            type: 'string',
            default: ''
        },
        azureAiCluDeploymentName: {
            type: 'string',
            default: ''
        },
        azureAiCluQueryUrl: {
            type: 'string',
            default: ''
        },
        azureAiCluQueryApiVersion: {
            type: 'string',
            default: ''
        },
        azureAiCluApiKey: {
            type: 'string',
            default: ''
        }
    },
    required: [
        'NODE_ENV',
        'LOG_LEVEL',
        'PORT',
        'azureAiCluResource',
        'azureAiCluProjectName',
        'azureAiCluDeploymentName',
        'azureAiCluQueryUrl',
        'azureAiCluQueryApiVersion',
        'azureAiCluApiKey'
    ]
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface IConfigServiceOptions {
}

const config: FastifyPluginAsync<IConfigServiceOptions> = async (server: FastifyInstance, _options: IConfigServiceOptions): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
        server.log.info({ tags: [ServiceName] }, `Registering ConfigService`);

        try {
            const envConfig = envSchema({
                schema: configSchema,
                data: process.env,
                dotenv: {
                    path: pathResolve(__dirname, `../../configs/${process.env.NODE_ENV}.env`)
                }
            });

            for (const key of Object.keys(envConfig)) {
                if (!envConfig[key as keyof IRpiPlcEnv]) {
                    return reject(new Error(`envConfig missing required value for: ${key}`));
                }
            }

            server.decorate(ServiceName, envConfig);

            return resolve();
        }
        catch (ex) {
            server.log.error({ tags: [ServiceName] }, `Registering ConfigService failed: ${ex.message}`);

            return reject(ex as Error);
        }
    });
};

declare module 'fastify' {
    interface FastifyInstance {
        config: IRpiPlcEnv;
    }
}

export default fp(config, {
    fastify: '4.x',
    name: 'config'
});
