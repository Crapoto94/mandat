import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, getToken, setToken, apiErrorMessage } from '../lib/api'
import type { AuthUser } from '../types'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  loginAgent: (username: string, password: string) => Promise<void>
  loginAdmin: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  async function loginAgent(username: string, password: string) {
    try {
      const res = await api.post('/auth/agent-login', { username, password })
      setToken(res.data.token)
      setUser(res.data.user)
    } catch (err) {
      throw new Error(apiErrorMessage(err, 'Connexion impossible'))
    }
  }

  async function loginAdmin(username: string, password: string) {
    try {
      const res = await api.post('/auth/admin-login', { username, password })
      setToken(res.data.token)
      setUser(res.data.user)
    } catch (err) {
      throw new Error(apiErrorMessage(err, 'Connexion impossible'))
    }
  }

  function logout() {
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, loginAgent, loginAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return ctx
}
