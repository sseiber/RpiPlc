import {
    FastifyInstance,
    FastifyPluginAsync
} from 'fastify';
import fp from 'fastify-plugin';

const RouteName = 'appHealthRouter';

const appHealthRouter: FastifyPluginAsync = async (routeInstance: FastifyInstance): Promise<void> => {
    routeInstance.log.info({ tags: [RouteName] }, `Registering App and Health routes...`);

    await new Promise<void>((resolve, reject) => {
        try {
            routeInstance.get('/', (_request, response) => {
                routeInstance.log.info({ tags: [RouteName] }, `getRoot`);

                return response.status(200).send({ 200: 'RpiPLC Service' });
            });

            routeInstance.get('/health', (_request, response) => {
                routeInstance.log.info({ tags: [RouteName] }, `getHealthCheck`);

                try {
                    // await utils.healthCheck();

                    return response.status(200).send(`healthy`);
                }
                catch (ex) {
                    return response.status(500).send(`Unhealthy: ${ex.message}`);
                }
            });

            return resolve();
        }
        catch (ex) {
            routeInstance.log.error({ tags: [RouteName] }, `Registering health routes failed: ${ex.message}`);

            return reject(ex as Error);
        }
    });
};

export default fp(appHealthRouter, {
    fastify: '4.x',
    name: RouteName,
    dependencies: [
        'config'
    ]
});
