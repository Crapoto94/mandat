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
