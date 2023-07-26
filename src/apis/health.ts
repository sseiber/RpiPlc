import { RoutePlugin, route } from 'spryly';
import { Request, ResponseToolkit, ResponseObject } from '@hapi/hapi';

export class HealthRoutes extends RoutePlugin {
    @route({
        method: 'GET',
        path: '/health',
        options: {
            tags: ['health'],
            description: 'Health status',
            auth: false
        }
    })
    public health(_request: Request, h: ResponseToolkit): ResponseObject {
        return h.response('healthy').code(200);
    }
}
