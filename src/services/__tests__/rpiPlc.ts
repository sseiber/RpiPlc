import { FastifyInstance } from 'fastify';
import { RpiPlcService } from '../../services/rpiPlc';

it('should be constructed', () => {
    const fastifyInstance = {} as FastifyInstance;
    const testInstance = new RpiPlcService(fastifyInstance);
    expect(testInstance).toBeDefined();
});
