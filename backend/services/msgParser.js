// Parsing des fichiers .msg (Outlook, format OLE compound) pour
// prévisualisation — basé sur @kenjiuno/msgreader (pur JS, sans dépendance
// native ni Outlook/COM). Même approche que l'app Hub DSI (appdsi).
const MsgReader = require('@kenjiuno/msgreader').default;
const { rtfBodyToHtml } = require('./rtfBody');

/** Nettoie une adresse Exchange X.500 (non affichable) au profit du nom. */
function displayAddress(name, email) {
  const smtp = email && /@/.test(email) && !email.startsWith('/O=') ? email : '';
  if (name && smtp) return `${name} <${smtp}>`;
  return name || smtp || '';
}

/** cid d'une pièce jointe (PidTagAttachContentId), débarrassé des chevrons
 * qu'on trouve parfois autour (`<image001.png@...>`). */
function cleanContentId(raw) {
  if (!raw) return null;
  return raw.replace(/^<|>$/g, '').trim() || null;
}

/** Parse un buffer .msg et renvoie une structure exploitable côté front.
 * `bodyHtml` retombe sur le corps RTF (décompressé puis converti) quand le
 * message n'a pas de corps HTML natif — cas très courant pour le courrier
 * composé en interne (Exchange), cf. services/rtfBody.js. Les images
 * intégrées au corps (`cid:...`) restent en l'état dans le HTML : c'est au
 * front de les résoudre via `inlineImages` (il connaît déjà l'URL de
 * chaque pièce jointe, msgParser n'en sait rien). */
async function parseMsgBuffer(buffer) {
  const reader = new MsgReader(buffer);
  const data = reader.getFileData();
  if (data.error) throw new Error(data.error);

  const to = (data.recipients || []).filter((r) => r.recipType === 'to').map((r) => displayAddress(r.name, r.smtpAddress || r.email));
  const cc = (data.recipients || []).filter((r) => r.recipType === 'cc').map((r) => displayAddress(r.name, r.smtpAddress || r.email));

  const rawAttachments = data.attachments || [];

  // Toute pièce jointe portant un content-id est une candidate à la
  // résolution `cid:` dans le corps — qu'elle soit par ailleurs listée comme
  // pièce jointe "visible" ou non (un message peut référencer par cid une
  // pièce jointe non masquée par certains clients).
  const inlineImages = [];
  rawAttachments.forEach((a, index) => {
    const cid = cleanContentId(a.pidContentId);
    if (cid) inlineImages.push({ contentId: cid, index });
  });

  const attachments = rawAttachments
    .map((a, index) => ({
      index,
      fileName: a.fileName || `piece-jointe-${index + 1}`,
      contentLength: a.contentLength || 0,
      mimeType: a.attachMimeTag || null,
    }))
    // Les images intégrées au corps HTML ne sont pas des pièces jointes à
    // lister séparément : masquées explicitement (attachmentHidden) ou, à
    // défaut de cette info, reconnaissables à leur nom générique + un cid.
    .filter((a, i) => {
      const raw = rawAttachments[i];
      if (raw.attachmentHidden === true) return false;
      if (raw.attachmentHidden === undefined && raw.pidContentId && /^image\d*\.(png|jpe?g|gif|bmp)$/i.test(a.fileName)) return false;
      return true;
    });

  let bodyHtml = data.bodyHTML || '';
  let usedRtfFallback = false;
  if (!bodyHtml && data.compressedRtf && data.compressedRtf.length) {
    bodyHtml = (await rtfBodyToHtml(data.compressedRtf)) || '';
    usedRtfFallback = true;
  }

  if (bodyHtml) {
    // Les images surdimensionnées (captures d'écran, logos...) ne doivent
    // jamais déborder du cadre d'aperçu.
    bodyHtml = `<style>img{max-width:100%;height:auto}body{word-wrap:break-word;overflow-wrap:break-word}</style>${bodyHtml}`;
  }

  const visibleIndexes = new Set(attachments.map((a) => a.index));
  const hiddenInlineImages = inlineImages.filter((img) => {
    if (visibleIndexes.has(img.index)) return false;
    const raw = rawAttachments[img.index] || {};
    const mime = (raw.attachMimeTag || '').toLowerCase();
    const name = (raw.fileName || '').toLowerCase();
    return mime.startsWith('image/') || /\.(png|jpe?g|gif|bmp|webp)$/.test(name);
  });
  if (usedRtfFallback && hiddenInlineImages.length) {
    // Le convertisseur RTF→HTML (rtf-parser) ne sait pas reconstituer les
    // images intégrées au corps (elles vivent dans des destinations RTF
    // qu'il ignore) : sans ça, elles disparaissent purement et simplement.
    // On les rajoute donc à la suite du texte plutôt que de les perdre —
    // pas à leur position d'origine dans le texte (indisponible), mais
    // visibles. `cid:...` reste le même mécanisme de résolution que pour un
    // corps HTML natif (cf. lib/msgBody.ts côté front).
    const gallery = hiddenInlineImages
      .map((img) => `<p><img src="cid:${img.contentId}" style="max-width:100%;height:auto" /></p>`)
      .join('');
    bodyHtml += `<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0" />${gallery}`;
  }

  return {
    subject: data.subject || '(sans objet)',
    from: displayAddress(data.senderName, data.senderEmail),
    to,
    cc,
    date: data.messageDeliveryTime || null,
    bodyText: data.body || '',
    bodyHtml,
    attachments,
    inlineImages,
  };
}

/** Extrait une pièce jointe embarquée par son index (voir attachments[].index ci-dessus). */
function extractMsgAttachment(buffer, index) {
  const reader = new MsgReader(buffer);
  const data = reader.getFileData();
  const att = (data.attachments || [])[index];
  if (!att) return null;
  const extracted = reader.getAttachment(att);
  return { fileName: att.fileName || `piece-jointe-${index + 1}`, mimeType: att.attachMimeTag || null, content: extracted.content };
}

module.exports = { parseMsgBuffer, extractMsgAttachment };
