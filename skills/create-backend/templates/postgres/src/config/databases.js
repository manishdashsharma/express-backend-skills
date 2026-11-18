import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import config from './index.js';
import logger from '../shared/utils/logger.js';

let writeClient;
let readClient;

const createClient = (connectionString) => new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: config.database.poolMax }),
  log: config.env === 'development' ? ['warn', 'error'] : ['error'],
});

const getWriteDB = () => {
  if (!writeClient) {
    writeClient = createClient(config.database.url);
  }
  return writeClient;
};

const getReadDB = () => {
  if (!config.database.readUrl) {
    return getWriteDB();
  }
  if (!readClient) {
    readClient = createClient(config.database.readUrl);
  }
  return readClient;
};

const connectDatabases = async () => {
  await getWriteDB().$connect();
  logger.info('PostgreSQL write connected');
  if (getReadDB() !== getWriteDB()) {
    await getReadDB().$connect();
    logger.info('PostgreSQL read connected');
  }
};

const checkDatabaseHealth = async () => {
  const startedAt = Date.now();
  try {
    await getWriteDB().$queryRaw`SELECT 1`;
    return { connected: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { connected: false, latencyMs: null, error: error.message };
  }
};

const disconnectDatabases = async () => {
  await Promise.all([writeClient?.$disconnect(), readClient?.$disconnect()]);
  logger.info('PostgreSQL disconnected');
};

export { getWriteDB, getReadDB, connectDatabases, checkDatabaseHealth, disconnectDatabases };
