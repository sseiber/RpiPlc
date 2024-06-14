import { FastifyInstance } from 'fastify';
import { Server, IncomingMessage, ServerResponse } from 'http';
import composeServer from './composeServer';
import { forget } from './utils';

const ModuleName = 'main';

process.on('unhandledRejection', (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
});

async function start() {
    const loggerConfig = process.env.NODE_ENV === 'production'
        ? true
        : {
            redact: ['req.headers.authorization'],
            level: 'info',
            serializers: {
                req(req: any) {
                    return {
                        method: req.method,
                        url: req.url,
                        protocol: req.protocol,
                        headers: {
                            'host': req.headers.host,
                            'user-agent': req.headers['user-agent']
                        }
                    };
                },
                // res(res) {
                //     return {
                //         statusCode: res.statusCode,
                //         status: res.status
                //     };
                // },
                tags: (tags: string[]) => {
                    return (tags && Array.isArray(tags)) ? `[${tags.join(',')}]` : '[]';
                }
            },
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    singleLine: true,
                    messageFormat: '{tags} {msg} {if req.url}url:({req.protocol}://{req.headers.host}{req.url}) {end}{res.statusCode} {responseTime}',
                    translateTime: 'SYS:yyyy-mm-dd"T"HH:MM:sso',
                    ignore: 'pid,hostname,module,tags,data,msg,req,res,reqId,responseTime'
                }
            }
        };

    try {
        const server: FastifyInstance<Server, IncomingMessage, ServerResponse> = await composeServer({
            logger: loggerConfig
        });

        server.log.info({ tags: [ModuleName] }, `🚀 Server instance started`);

        const PORT = (server.config.PORT ?? process.env.PORT ?? process.env.port ?? process.env.PORT0 ?? process.env.port0) ?? '9092';

        await server.listen({
            host: '0.0.0.0',
            port: parseInt(PORT, 10)
        });

        for (const signal of ['SIGINT', 'SIGTERM']) {
            process.on(signal, () => {
                void (async () => {
                    server.log.info({ tags: [ModuleName] }, `Closing server instance with ${signal}`);

                    await server.close();
                })()
                    .catch((ex) => {
                        // eslint-disable-next-line no-console
                        console.error(`Error ${ModuleName}: ${ex.message}`);
                    })
                    .finally(() => {
                        process.exit(0);
                    });
            });
        }
    }
    catch (ex) {
        /* eslint-disable no-console */
        console.error(`Error ${ModuleName}: ${ex.message}`);
        console.info(`Error ${ModuleName}: ☮︎ Stopping server`);
        /* eslint-enable no-console */

        process.exit(1);
    }
}

forget(start);
