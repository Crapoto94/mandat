const express = require('express');
const apm = require('../../services/apm');
const { db } = require('../../db/pg_db');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.post('/mail', requireAuth, async (req, res) => {
  const { to, subject, content } = req.body || {};
  if (!to || !subject || !content) {
    return res.status(400).json({ error: 'to, subject et content sont requis' });
  }
  try {
    const result = await apm.sendMail({ to, subject, content });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Envoi du mail impossible : ${err.message}` });
  }
});

router.post('/sms', requireAuth, async (req, res) => {
  const { mobile, message } = req.body || {};
  if (!mobile || !message) {
    return res.status(400).json({ error: 'mobile et message sont requis' });
  }
  try {
    const result = await apm.sendSms({ mobile, message });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Envoi du SMS impossible : ${err.message}` });
  }
});

/** Relance mail pré-remplie à partir d'un engagement (rappel de l'échéance / du point d'avancement attendu). */
router.post('/engagements/:id/relance', requireAuth, async (req, res) => {
  const { to, message } = req.body || {};
  if (!to || !message) return res.status(400).json({ error: 'to et message sont requis' });

  const engagement = await db.get(`SELECT * FROM mandat.engagements WHERE id = $1`, [req.params.id]);
  if (!engagement) return res.status(404).json({ error: 'Engagement introuvable' });

  try {
    const result = await apm.sendMail({
      to,
      subject: `Suivi mandat — engagement n°${engagement.numero} : point d'avancement`,
      content: `<p>${message.replace(/\n/g, '<br/>')}</p>
                 <p><em>Engagement n°${engagement.numero} — ${engagement.contenu}</em></p>`,
    });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: `Envoi du mail impossible : ${err.message}` });
  }
});

module.exports = router;
