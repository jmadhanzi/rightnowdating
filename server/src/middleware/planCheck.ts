import type { FastifyReply, FastifyRequest } from 'fastify';
import { getUserPlan, planRank, type Plan } from '../services/plan.service.js';

/**
 * preHandler factory that requires at least `minimumPlan`. Must run after
 * authenticateToken. On insufficient plan, responds 403 with upgrade details.
 */
export function requirePlan(minimumPlan: Plan) {
  return async function planGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { userId } = request.user;
    const currentPlan = await getUserPlan(userId);
    if (planRank(currentPlan) < planRank(minimumPlan)) {
      await reply.status(403).send({
        upgradeRequired: true,
        currentPlan,
        requiredPlan: minimumPlan,
      });
    }
  };
}
