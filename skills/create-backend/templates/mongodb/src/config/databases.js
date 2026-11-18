import mongoose from 'mongoose';
import config from './index.js';
import logger from '../shared/utils/logger.js';

const state = globalThis.mongooseState || { conn: null, promise: null };
globalThis.mongooseState = state;

const getMongoose = async () => {
  if (state.conn) {
    return state.conn;
  }
  if (!config.mongo.uri) {
    const error = new Error('MONGODB_URI is not set');
    error.statusCode = 503;
    throw error;
  }
  if (!state.promise) {
    state.promise = mongoose
      .connect(config.mongo.uri, { maxPoolSize: config.mongo.maxPoolSize })
      .catch((error) => {
        state.promise = null;
        throw error;
      });
  }
  state.conn = await state.promise;
  return state.conn;
};

const connectDatabases = async () => {
  await getMongoose();
  logger.info('MongoDB connected');
};

const checkDatabaseHealth = async () => {
  const startedAt = Date.now();
  try {
    await mongoose.connection.db.admin().ping();
    return { connected: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { connected: false, latencyMs: null, error: error.message };
  }
};

const disconnectDatabases = async () => {
  await mongoose.disconnect();
  state.conn = null;
  state.promise = null;
  logger.info('MongoDB disconnected');
};

export { getMongoose, connectDatabases, checkDatabaseHealth, disconnectDatabases };
