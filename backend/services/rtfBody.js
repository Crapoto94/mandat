// Corps RTF compressé (PidTagRtfCompressed) d'un .msg → HTML, pour les
// messages composés en interne (Exchange/Outlook) dont le corps n'existe
// qu'en RTF, sans version HTML native (data.bodyHTML alors vide côté
// @kenjiuno/msgreader). Très fréquent pour le courrier interne à la ville.
const { decompressRTF } = require('@kenjiuno/decompressrtf');
const rtfToHTML = require('@iarna/rtf-to-html');

/**
 * Décompresse puis convertit un corps RTF en HTML. Ne lève jamais : le
 * parseur RTF (rtf-parser, assez permissif mais pas infaillible sur des
 * documents Outlook complexes) peut échouer sur certains messages — dans ce
 * cas on renvoie null pour que l'appelant retombe sur le texte brut plutôt
 * que de faire échouer tout l'aperçu.
 */
function rtfBodyToHtml(compressedRtf) {
  return new Promise((resolve) => {
    let rtfString;
    try {
      const decompressed = decompressRTF(Array.from(compressedRtf));
      // Les octets RTF (dont les échappements \'xx en codepage Windows-1252)
      // doivent être conservés tels quels, pas réinterprétés en UTF-8.
      rtfString = Buffer.from(decompressed).toString('binary');
    } catch {
      resolve(null);
      return;
    }
    try {
      rtfToHTML.fromString(rtfString, (err, html) => {
        if (err || !html) {
          resolve(null);
          return;
        }
        // rtfToHTML renvoie un document complet (<!DOCTYPE>...<body>...) : on
        // n'en garde que le contenu du <body>, pour l'insérer dans notre
        // propre structure d'aperçu (cf. msgParser.parseMsgBuffer).
        const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        resolve(match ? match[1].trim() : html);
      });
    } catch {
      resolve(null);
    }
  });
}

module.exports = { rtfBodyToHtml };
