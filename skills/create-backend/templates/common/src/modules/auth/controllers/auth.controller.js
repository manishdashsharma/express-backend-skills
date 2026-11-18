import config from '../../../config/index.js';
import {
  asyncHandler,
  httpResponse,
  httpError,
  responseMessage,
  logger,
} from '../../../shared/index.js';
import {
  signUpService,
  signInService,
  refreshSessionService,
  logoutService,
  logoutAllService,
  getMeService,
  listSessionsService,
} from '../services/auth.service.js';

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
  path: config.cookie.path,
});

const setRefreshCookie = (res, refreshToken) => {
  res.cookie(config.cookie.refreshName, refreshToken, {
    ...cookieOptions(),
    maxAge: config.cookie.maxAgeMs,
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie(config.cookie.refreshName, cookieOptions());
};

const requestContext = (req) => ({
  userAgent: req.get('User-Agent')?.slice(0, 300) ?? null,
  ip: req.ip ?? null,
});

const refreshTokenOf = (req) => req.cookies?.[config.cookie.refreshName] ?? null;

const failed = (req, res, error, message) => {
  const status = error.statusCode || 500;
  logger[status >= 500 ? 'error' : 'warn'](message, {
    error: error.message,
    stack: status >= 500 ? error.stack : undefined,
    userId: req.user?.id,
    requestId: req.requestId,
  });
  return httpError(req, res, error, status);
};

const signUp = asyncHandler(async (req, res) => {
  try {
    const { accessToken, refreshToken, user } = await signUpService(req.body, requestContext(req));
    setRefreshCookie(res, refreshToken);
    logger.info('User signed up', { userId: user.id, requestId: req.requestId });
    return httpResponse(req, res, 201, responseMessage.custom('Account created'), {
      accessToken,
      user,
    });
  } catch (error) {
    return failed(req, res, error, 'Sign up failed');
  }
});

const signIn = asyncHandler(async (req, res) => {
  try {
    const { accessToken, refreshToken, user } = await signInService(req.body, requestContext(req));
    setRefreshCookie(res, refreshToken);
    logger.info('User signed in', { userId: user.id, requestId: req.requestId });
    return httpResponse(req, res, 200, responseMessage.custom('Signed in'), { accessToken, user });
  } catch (error) {
    return failed(req, res, error, 'Sign in failed');
  }
});

const refreshSession = asyncHandler(async (req, res) => {
  try {
    const { accessToken, refreshToken } = await refreshSessionService(
      refreshTokenOf(req),
      requestContext(req)
    );
    if (refreshToken) {
      setRefreshCookie(res, refreshToken);
    }
    return httpResponse(req, res, 200, responseMessage.custom('Session refreshed'), {
      accessToken,
    });
  } catch (error) {
    clearRefreshCookie(res);
    return failed(req, res, error, 'Refresh failed');
  }
});

const logout = asyncHandler(async (req, res) => {
  try {
    await logoutService(refreshTokenOf(req));
    clearRefreshCookie(res);
    return httpResponse(req, res, 200, responseMessage.custom('Signed out'));
  } catch (error) {
    return failed(req, res, error, 'Logout failed');
  }
});

const logoutAll = asyncHandler(async (req, res) => {
  try {
    await logoutAllService(req.user.id);
    clearRefreshCookie(res);
    logger.info('Signed out everywhere', { userId: req.user.id, requestId: req.requestId });
    return httpResponse(req, res, 200, responseMessage.custom('Signed out on every device'));
  } catch (error) {
    return failed(req, res, error, 'Logout everywhere failed');
  }
});

const getMe = asyncHandler(async (req, res) => {
  try {
    const user = await getMeService(req.user.id);
    return httpResponse(req, res, 200, responseMessage.custom('Profile fetched'), { user });
  } catch (error) {
    return failed(req, res, error, 'Get profile failed');
  }
});

const listSessions = asyncHandler(async (req, res) => {
  try {
    const sessions = await listSessionsService(req.user.id, refreshTokenOf(req));
    return httpResponse(req, res, 200, responseMessage.custom('Sessions fetched'), { sessions });
  } catch (error) {
    return failed(req, res, error, 'List sessions failed');
  }
});

export { signUp, signIn, refreshSession, logout, logoutAll, getMe, listSessions };
