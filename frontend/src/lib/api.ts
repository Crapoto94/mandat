import axios from 'axios'

// L'URL du backend est injectée au build via VITE_API_URL (jamais en dur).
// En dev, elle est absente : on passe par le proxy Vite (/api -> backend).
const backendOrigin = import.meta.env.VITE_API_URL || ''

export const api = axios.create({
  baseURL: `${backendOrigin}/api`,
})

const TOKEN_KEY = 'mandat_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      setToken(null)
      if (!window.location.pathname.startsWith('/connexion')) {
        window.location.href = '/connexion'
      }
    }
    return Promise.reject(err)
  }
)

export function apiErrorMessage(err: unknown, fallback = 'Une erreur est survenue'): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.error || err.message || fallback
  }
  return fallback
}

/**
 * URL d'un fichier joint, utilisable dans une balise <img> ou un lien de
 * téléchargement direct : le jeton passe en query string car ces balises ne
 * peuvent pas fixer d'en-tête Authorization (cf. requireAuthQueryOrHeader
 * côté backend).
 */
export function attachmentFileUrl(id: number): string {
  return `${backendOrigin}/api/attachments/${id}/file?token=${encodeURIComponent(getToken() || '')}`
}

/** Pièce jointe embarquée dans un .msg (cf. DocumentViewer), par index. */
export function msgAttachmentUrl(id: number, index: number): string {
  return `${backendOrigin}/api/attachments/${id}/msg/attachments/${index}?token=${encodeURIComponent(getToken() || '')}`
}

/** Fichier de la base documentaire d'un projet (cf. modules/projets/documents.routes.js). */
export function projetDocumentUrl(id: number, download = false): string {
  const dl = download ? '&download=1' : ''
  return `${backendOrigin}/api/projets/documents/${id}/file?token=${encodeURIComponent(getToken() || '')}${dl}`
}
