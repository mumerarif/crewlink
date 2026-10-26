const express = require('express');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const document = require('./document');

const router = express.Router();

const docsContentSecurityPolicy = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'],
    fontSrc: ["'self'", 'data:'],
    upgradeInsecureRequests: null,
  },
});

const swaggerOptions = {
  customSiteTitle: 'CrewLink API Documentation',
  swaggerOptions: {
    displayRequestDuration: true,
    persistAuthorization: false,
  },
};

router.get('/openapi.json', (_req, res) => {
  res.json(document);
});
router.use(
  '/docs',
  docsContentSecurityPolicy,
  swaggerUi.serveFiles(document, swaggerOptions),
  swaggerUi.setup(document, swaggerOptions),
);

module.exports = router;
