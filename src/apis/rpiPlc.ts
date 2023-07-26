import { inject, RoutePlugin, route } from 'spryly';
import { Request, ResponseObject, ResponseToolkit } from '@hapi/hapi';
import {
    badRequest as boom_badRequest
} from '@hapi/boom';
import { RpiPlcService } from '../services/rpiPlc';
import { IRpiPlcServiceRequest } from '../models/rpiPlcTypes';

export class RpiPlcRoutes extends RoutePlugin {
    @inject('rpiPlcService')
    private rpiPlcService: RpiPlcService;

    @route({
        method: 'POST',
        path: '/api/v1/process/control',
        options: {
            tags: ['control'],
            description: 'Control'
        }
    })
    public async postProcess(request: Request, h: ResponseToolkit): Promise<ResponseObject> {
        const controlRequest = request.payload as IRpiPlcServiceRequest;
        if (!controlRequest.action) {
            throw boom_badRequest('Expected action field in request playload');
        }

        try {
            const controlResponse = await this.rpiPlcService.control(controlRequest);

            return h.response(controlResponse).code(201);
        }
        catch (ex) {
            throw boom_badRequest(ex.message);
        }
    }
}
