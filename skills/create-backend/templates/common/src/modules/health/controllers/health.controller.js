import { httpResponse, httpError, responseMessage } from '../../../shared/index.js';
import { getLivenessService, getReadinessService } from '../services/health.service.js';

const getLiveness = (req, res) => httpResponse(
  req,
  res,
  200,
  responseMessage.custom('OK'),
  getLivenessService()
);

const getReadiness = async (req, res) => {
  const { ready, database, redis } = await getReadinessService();
  const data = { status: ready ? 'ready' : 'degraded', database, redis };
  if (!ready) {
    return httpError(req, res, Object.assign(new Error('Service is degraded'), { data }), 503);
  }
  return httpResponse(req, res, 200, responseMessage.custom('Ready'), data);
};

export { getLiveness, getReadiness };
