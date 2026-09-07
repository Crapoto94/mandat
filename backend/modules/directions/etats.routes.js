const express = require('express');
const { db } = require('../../db/pg_db');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const rows = await db.all(`SELECT * FROM etats ORDER BY ordre ASC`);
  res.json(rows);
});

module.exports = router;
