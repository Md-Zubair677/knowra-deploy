const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const { clientUrls } = require('./config/env');
const swaggerSpec = require('./docs/swagger');
const routes = require('./routes');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');
const { generalLimiter } = require('./middlewares/rateLimiter');
const { sanitizeMongoInput } = require('./middlewares/sanitizeMongoInput');

const app = express();

app.use(helmet());
app.use(cors({ origin: clientUrls }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api', generalLimiter);
app.use('/api', sanitizeMongoInput);
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;