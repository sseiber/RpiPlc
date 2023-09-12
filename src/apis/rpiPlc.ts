import { inject, RoutePlugin, route } from 'spryly';
import { Request, ResponseObject, ResponseToolkit } from '@hapi/hapi';
import {
    badRequest as boom_badRequest
} from '@hapi/boom';
import { RpiPlcService } from '../services/rpiPlc';
import { IRpiPlcServiceRequest, IObserveRequest } from '../models/rpiPlcTypes';

export class RpiPlcRoutes extends RoutePlugin {
    @inject('rpiPlcService')
    private rpiPlcService: RpiPlcService;

    @route({
        method: 'POST',
        path: '/api/v1/observe',
        options: {
            tags: ['observe'],
            description: 'Observe'
        }
    })
    public async postObserve(request: Request, h: ResponseToolkit): Promise<ResponseObject> {
        const observeRequest = request.payload as IObserveRequest;
        if (!observeRequest.observeTargets) {
            throw boom_badRequest('Request playload is missing required fields');
        }

        try {
            const controlResponse = await this.rpiPlcService.observe(observeRequest);

            return h.response(controlResponse).code(201);
        }
        catch (ex) {
            throw boom_badRequest(ex.message);
        }
    }

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
            throw boom_badRequest('Request playload is missing required fields');
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
