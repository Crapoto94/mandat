// Chemin explicite : sinon dotenv cherche .env dans process.cwd(), qui peut
// différer du dossier backend/ selon la façon dont le process est lancé
// (ex. `npm --prefix backend run dev` depuis la racine du repo).
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const { checkConnection } = require('./db/pg_db');
const apm = require('./services/apm');

const authRoutes = require('./modules/auth/auth.routes');
const engagementsRoutes = require('./modules/engagements/engagements.routes');
const commentsRoutes = require('./modules/comments/comments.routes');
const coordinationRoutes = require('./modules/coordination/coordination.routes');
const groupsRoutes = require('./modules/groups/groups.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const notifyRoutes = require('./modules/notify/notify.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const directionsRoutes = require('./modules/directions/directions.routes');
const etatsRoutes = require('./modules/directions/etats.routes');
const engagementTimelineRoutes = require('./modules/engagements/engagement-timeline.routes');
const rolesRoutes = require('./modules/roles/roles.routes');
const agentsRoutes = require('./modules/agents/agents.routes');
const timelineRoutes = require('./modules/timeline/timeline.routes');
const meteoRoutes = require('./modules/meteo/meteo.routes');
const attachmentsRoutes = require('./modules/attachments/attachments.routes');
const locksRoutes = require('./modules/engagements/locks.routes');

const app = express();
const PORT = process.env.PORT || 5151;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5150' }));
app.use(express.json({ limit: '2mb' }));

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'Suivi des engagements du mandat — API', version: '1.0.0' },
    servers: [{ url: '/api' }],
  },
  apis: ['./modules/**/*.routes.js'],
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Santé & supervision — cf. guide §6.
app.get('/api/status', async (req, res) => {
  const [dbOk, apmStatus] = await Promise.all([checkConnection(), apm.status()]);
  res.json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'up' : 'down',
    apm: apmStatus,
    time: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/engagements', engagementsRoutes);
app.use('/api/engagements', engagementTimelineRoutes); // /:id/roles, /:id/steps
app.use('/api/engagements', locksRoutes); // /:id/locks (édition collaborative)
app.use('/api', commentsRoutes); // expose /api/engagements/:id/comments
app.use('/api/roles', rolesRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/coordination', coordinationRoutes);
app.use('/api/groupes', groupsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notify', notifyRoutes); // /api/notify/mail, /sms, /engagements/:id/relance
app.use('/api/admin', adminRoutes);
app.use('/api/directions', directionsRoutes);
app.use('/api/etats', etatsRoutes);
app.use('/api/meteos', meteoRoutes);
app.use('/api', attachmentsRoutes); // /api/engagements/:id/attachments, /api/attachments/:id/file

app.use((req, res) => res.status(404).json({ error: 'Route inconnue' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] Erreur non gérée :', err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

app.listen(PORT, () => {
  console.log(`[server] API "suivi des engagements du mandat" démarrée sur le port ${PORT}`);
  console.log(`[server] Documentation Swagger : http://localhost:${PORT}/api-docs`);
  checkConnection().then((ok) => {
    if (!ok) {
      console.warn('[server] ⚠️  Base de données injoignable au démarrage — vérifier .env / le service Postgres.');
    }
  });
});
