import {
    FastifyInstance,
    FastifyPluginAsync
} from 'fastify';
import fp from 'fastify-plugin';

const RouteName = 'appHealthRouter';

const appHealthRouter: FastifyPluginAsync = async (instance: FastifyInstance): Promise<void> => {
    instance.log.info({ tags: [RouteName] }, `Registering App and Health routes...`);

    await instance.register(async (routeInstance, _routeOptions) => {

        await new Promise<void>((resolve, reject) => {
            try {
                routeInstance.get('/', (_request, response) => {
                    routeInstance.log.info({ tags: [RouteName] }, `getRoot`);

                    response.status(200).send({ 200: 'RpiPLC Service' });
                });

                routeInstance.get('/health-check', (_request, response) => {
                    routeInstance.log.info({ tags: [RouteName] }, `getHealthCheck`);

                    try {
                        // await utils.healthCheck();

                        response.status(200).send(`healthy`);
                    }
                    catch (ex) {
                        response.status(500).send(`Unhealthy: ${ex.message}`);
                    }
                });

                return resolve();
            }
            catch (ex) {
                routeInstance.log.error({ tags: [RouteName] }, `Registering health routes failed: ${ex.message}`);

                return reject(ex as Error);
            }
        });
    });
};

export default fp(appHealthRouter, {
    fastify: '4.x',
    name: RouteName,
    dependencies: [
        'config'
    ]
});
