import {
    FastifyInstance,
    FastifyPluginAsync
} from 'fastify';
import fp from 'fastify-plugin';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import {
    IServiceErrorMessage,
    IRpiPlcResponse,
    IControlRequest,
    IObserveRequest,
    IServiceErrorMessageSchema,
    IRpiPlcResponseSchema,
    IControlRequestSchema,
    IObserveRequestSchema
} from '@loopbox/types';

const RouteName = 'rpiPlcRouter';

interface IRpiPlcReply {
    '201': IRpiPlcResponse;
    '4xx': IServiceErrorMessage;
    '5xx': IServiceErrorMessage;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IRpiPlcRouteOptions {
}

const nliRouter: FastifyPluginAsync<IRpiPlcRouteOptions> = async (instance: FastifyInstance, options: IRpiPlcRouteOptions): Promise<void> => {
    instance.log.info({ tags: [RouteName] }, `Registering RpiPlc routes...`);

    await instance.register(async (routeInstance, _routeOptions) => {
        await new Promise<void>((resolve, reject) => {
            try {
                const server = routeInstance.withTypeProvider<JsonSchemaToTsProvider>();

                server.route<{ Body: IControlRequest; Reply: IRpiPlcReply }>({
                    method: 'POST',
                    url: '/control',
                    schema: {
                        body: IControlRequestSchema,
                        response: {
                            '201': IRpiPlcResponseSchema,
                            '4xx': IServiceErrorMessageSchema,
                            '5xx': IServiceErrorMessageSchema
                        }
                    },
                    handler: async (request, response) => {
                        server.log.info({ tags: [RouteName] }, `postProcessControlRoute`);

                        try {
                            const controlRequest = request.body as IControlRequest;
                            if (!controlRequest.observeTargets) {
                                throw routeInstance.httpErrors.badRequest('Request playload is missing required fields');
                            }

                            const controlResponse = await this.rpiPlcService.observe(controlRequest);

                            response.status(201).send(controlResponse);
                        }
                        catch (ex) {
                            throw routeInstance.httpErrors.badRequest(ex.message);
                        }
                    }
                });

                server.route<{ Body: IObserveRequest; Reply: IRpiPlcReply }>({
                    method: 'POST',
                    url: '/observe',
                    schema: {
                        body: IObserveRequestSchema,
                        response: {
                            '201': IRpiPlcResponseSchema,
                            '4xx': IServiceErrorMessageSchema,
                            '5xx': IServiceErrorMessageSchema
                        }
                    },
                    handler: async (request, response) => {
                        server.log.info({ tags: [RouteName] }, `postObserveRoute`);

                        try {
                            const observeRequest = request.body as IObserveRequest;
                            if (!observeRequest.observeTargets) {
                                throw routeInstance.httpErrors.badRequest('Request playload is missing required fields');
                            }

                            const observeResponse = await this.rpiPlcService.observe(observeRequest);

                            response.status(201).send(observeResponse);
                        }
                        catch (ex) {
                            throw routeInstance.httpErrors.badRequest(ex.message);
                        }
                    }
                });

                return resolve();
            }
            catch (ex) {
                instance.log.error({ tags: [RouteName] }, `Registering RpiPlc routes failed: ${ex.message}`);

                return reject(ex as Error);
            }
        });
    }, options);
};

export default fp(nliRouter, {
    fastify: '4.x',
    name: RouteName,
    dependencies: [
        'config',
        'rpiPlcService'
    ]
});
