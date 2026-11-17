// Cache mémoire à durée de vie, avec déduplication des appels concurrents
// (« single-flight ») : si deux requêtes demandent la même clé pendant qu'elle
// est en cours de chargement, elles partagent la même promesse et ne déclenchent
// qu'un seul appel en aval (scan Oracle via FDW, résolution LDAP, API du Hub
// DSI). Sans cela, une dizaine de connexions simultanées — cas réel au
// démarrage d'un conteneur, quand le cache est froid — déclencherait autant
// d'appels identiques et siphonnerait d'autant la source.
//
// Les échecs sont mémorisés eux aussi, mais brièvement (errorTtlMs) : pendant
// une panne de la source, on ne veut pas re-solliciter LDAP/Oracle/Hub à
// chaque requête, ce qui transformerait une panne en cascade de timeouts.
function createTtlCache({ ttlMs, errorTtlMs = Math.min(ttlMs, 30000), maxEntries = 64 }) {
  const entries = new Map();

  function evict() {
    if (entries.size <= maxEntries) return;
    // Map préserve l'ordre d'insertion : on évince les plus anciennes entrées,
    // après avoir purgé celles qui sont périmées (elles ne servent plus à rien).
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
    for (const key of entries.keys()) {
      if (entries.size <= maxEntries) break;
      entries.delete(key);
    }
  }

  return {
    /**
     * Renvoie la valeur mise en cache pour `key`, ou la charge via `loader`.
     * L'erreur eventuale du loader est repropagee telle quelle (et mémorisée
     * pour `errorTtlMs`) : l'appelant décide de son traitement.
     */
    async get(key, loader) {
      const now = Date.now();
      const cached = entries.get(key);
      if (cached) {
        // Une charge en cours prime : on s'y agrège plutôt que de lire `value`,
        // qui n'est renseignée qu'à la résolution (et ne le sera jamais si le
        // loader échoue).
        if (cached.inflight) return cached.inflight;
        if (cached.expiresAt > now) {
          // Pénalité courte pour un échec : pendant une panne de la source on
          // ne la sollicite pas à chaque requête. Passé ce délai, on retente.
          if (cached.error) throw cached.error;
          return cached.value;
        }
      }

      const inflight = (async () => loader())();
      const record = { inflight, value: undefined, error: null, expiresAt: now + ttlMs };
      entries.set(key, record);
      evict();

      try {
        record.value = await inflight;
        return record.value;
      } catch (err) {
        record.error = err;
        record.inflight = null;
        record.expiresAt = Date.now() + errorTtlMs;
        throw err;
      } finally {
        record.inflight = null;
      }
    },

    /** Vide une clé (après une modification du référentiel, ex. activation
     *  d'un groupe en admin) ou tout le cache. */
    invalidate(key) {
      if (key === undefined) entries.clear();
      else entries.delete(String(key));
    },
  };
}

module.exports = { createTtlCache };
