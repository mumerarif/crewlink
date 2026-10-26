const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const authenticate = require('./middlewares/authenticate');
const { publicAuthRouter } = require('./modules/auth/auth.routes');
const routes = require('./routes');
const openApiRouter = require('./openapi/router');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.nodeEnv === 'test' ? 'tiny' : 'combined'));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'crewlink-api',
    instance: env.instanceId,
  });
});

if (env.apiDocsEnabled) app.use('/api', openApiRouter);
app.use('/api/auth', publicAuthRouter);
app.use('/api', authenticate, routes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
