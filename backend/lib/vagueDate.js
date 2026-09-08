// Une échéance ou une étape n'est pas toujours connue avec précision : "2028",
// "T3 2030", "juin 2029" sont des réponses légitimes, plus honnêtes qu'une
// fausse précision. Pour rester triable/positionnable dans une timeline
// (colonne date_etape, de type DATE), on convertit toute saisie vague en une
// date représentative placée au milieu de la période exprimée — cf. demande
// explicite : "juin 28" doit se positionner au 15/06/28.
const MONTHS_FR = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

// Mois représentatif du milieu de chaque trimestre (T1 = jan-mars, milieu
// février ; T2 = avr-juin, milieu mai ; etc.).
const MID_QUARTER_MONTH = { 1: 2, 2: 5, 3: 8, 4: 11 };

function stripDiacritics(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Convertit une saisie de date (précise ou vague) en date ISO (YYYY-MM-DD),
 * ou renvoie null si la chaîne est vide. Lève une erreur si la saisie n'est
 * ni vide ni reconnaissable, pour que l'appelant puisse renvoyer un message
 * clair plutôt que de silencieusement perdre l'info saisie.
 *
 * Formats reconnus : YYYY-MM-DD, DD/MM/YYYY, "T<1-4> YYYY" (trimestre),
 * "<mois en français> YYYY", "YYYY" (année seule).
 */
function parseVagueDate(input) {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;

  const fr = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fr) {
    const [, d, m, y] = fr;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  const quarter = raw.match(/^T\s*([1-4])[\s.\-/]*(\d{4})$/i) || raw.match(/^([1-4])\s*T[\s.\-/]*(\d{4})$/i);
  if (quarter) {
    const q = Number(quarter[1]);
    const y = quarter[2];
    return `${y}-${pad2(MID_QUARTER_MONTH[q])}-15`;
  }

  const monthYear = stripDiacritics(raw.toLowerCase()).match(/^([a-z]+)[\s.\-/]*(\d{4})$/);
  if (monthYear) {
    const month = MONTHS_FR[monthYear[1]];
    if (month) return `${monthYear[2]}-${pad2(month)}-15`;
  }

  const yearOnly = raw.match(/^(\d{4})$/);
  if (yearOnly) return `${yearOnly[1]}-06-15`; // milieu d'année

  throw new Error(
    `Date non reconnue : "${raw}" — formats acceptés : une date (JJ/MM/AAAA), un mois ("juin 2029"), ` +
      `un trimestre ("T3 2030") ou une année seule ("2028").`
  );
}

module.exports = { parseVagueDate };
