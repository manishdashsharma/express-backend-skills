import { checkDatabaseHealth } from '../../../config/databases.js';
import { checkRedisHealth } from '../../../config/redis.js';

const getLivenessService = () => ({
  status: 'alive',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
});

const getReadinessService = async () => {
  const [database, redis] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);
  return { ready: database.connected, database, redis };
};

export { getLivenessService, getReadinessService };
