import {
    FastifyInstance,
    FastifyPluginAsync
} from 'fastify';
import fp from 'fastify-plugin';
import {
    IServiceReply,
    IServiceResponseSchema,
    IServiceErrorMessageSchema,
    IObserveRequest,
    IObserveRequestSchema,
    IControlRequest,
    IControlRequestSchema
} from '../models/index.js';
import { exMessage } from '../utils/index.js';
import { ServiceName as RpiPlcServiceName } from '../services/rpiPlc.js';

const RouteName = 'rpiPlcRouter';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IRpiPlcRouteOptions {
}

const nliRouter: FastifyPluginAsync<IRpiPlcRouteOptions> = async (fastifyInstance: FastifyInstance, options: IRpiPlcRouteOptions): Promise<void> => {
    fastifyInstance.log.info({ tags: [RouteName] }, `registering...`);

    await fastifyInstance.register(async (routeInstance, _routeOptions) => {
        await new Promise<void>((resolve, reject) => {
            try {
                routeInstance.route<{ Body: IObserveRequest; Reply: IServiceReply }>({
                    method: 'POST',
                    url: '/observe',
                    schema: {
                        body: IObserveRequestSchema,
                        response: {
                            201: IServiceResponseSchema,
                            '4xx': IServiceErrorMessageSchema,
                            '5xx': IServiceErrorMessageSchema
                        }
                    },
                    handler: async (request, response) => {
                        routeInstance.log.info({ tags: [RouteName] }, `postObserveRoute`);

                        try {
                            const observeRequest = request.body;
                            if (!observeRequest.observeTargets) {
                                throw routeInstance.httpErrors.badRequest('Request playload is missing required fields');
                            }

                            const observeResponse = routeInstance.rpiPlcService.observe(observeRequest);

                            return response.status(201).send(observeResponse);
                        }
                        catch (ex) {
                            throw routeInstance.httpErrors.badRequest(exMessage(ex));
                        }
                    }
                });

                routeInstance.route<{ Body: IControlRequest; Reply: IServiceReply }>({
                    method: 'POST',
                    url: '/control',
                    schema: {
                        body: IControlRequestSchema,
                        response: {
                            201: IServiceResponseSchema,
                            '4xx': IServiceErrorMessageSchema,
                            '5xx': IServiceErrorMessageSchema
                        }
                    },
                    handler: async (request, response) => {
                        routeInstance.log.info({ tags: [RouteName] }, `postProcessControlRoute`);

                        try {
                            const controlRequest = request.body;
                            if (!controlRequest.action) {
                                throw routeInstance.httpErrors.badRequest('Request playload is missing required fields');
                            }

                            const controlResponse = await routeInstance.rpiPlcService.control(controlRequest);

                            return response.status(201).send(controlResponse);
                        }
                        catch (ex) {
                            throw routeInstance.httpErrors.badRequest(exMessage(ex));
                        }
                    }
                });

                return resolve();
            }
            catch (ex) {
                fastifyInstance.log.error({ tags: [RouteName] }, `Registering RpiPlc routes failed: ${exMessage(ex)}`);

                return reject(ex as Error);
            }
        });
    }, options);
};

export default fp(nliRouter, {
    fastify: '5.x',
    name: RouteName,
    dependencies: [
        RpiPlcServiceName
    ]
});
