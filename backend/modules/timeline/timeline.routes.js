// Timeline globale : toutes les étapes datées, tous engagements confondus,
// pour une vue chronologique transverse (cf. timeline par projet, disponible
// via GET /api/engagements/:id/steps).
const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { groupe_id, axe } = req.query;
  const clauses = [];
  const params = [];

  if (groupe_id) {
    if (groupe_id === 'none') clauses.push('e.groupe_id IS NULL');
    else {
      params.push(groupe_id);
      clauses.push(`e.groupe_id = $${params.length}`);
    }
  }
  if (axe) {
    params.push(`%${axe}%`);
    clauses.push(`e.axe ILIKE $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = await db.all(
    `SELECT s.*, e.numero AS engagement_numero, e.contenu AS engagement_contenu,
            e.axe AS engagement_axe, g.code AS groupe_code
     FROM engagement_steps s
     JOIN engagements e ON e.id = s.engagement_id
     LEFT JOIN groupes g ON g.id = e.groupe_id
     ${where}
     ORDER BY s.date_etape ASC NULLS LAST, s.created_at ASC`,
    params
  );
  res.json(rows);
});

module.exports = router;
