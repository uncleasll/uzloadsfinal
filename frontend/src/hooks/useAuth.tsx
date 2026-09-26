import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authApi, type AuthUser } from '@/api/auth'

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  sessionExpired: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  register: (p: { company_name: string; name: string; email: string; password: string }) => Promise<void>
  acceptInvite: (token: string, p: { password: string; phone?: string }) => Promise<AuthUser>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null, loading: true, sessionExpired: false,
  login: async () => ({} as AuthUser), register: async () => {}, acceptInvite: async () => ({} as AuthUser), logout: () => {},
  isAuthenticated: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    const clearSession = () => {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      setUser(null)
      setSessionExpired(true)
    }
    window.addEventListener('auth-expired', clearSession)
    const token = localStorage.getItem('auth_token')
    if (token) {
      authApi.me().then(setUser).catch(clearSession).finally(() => setLoading(false))
    } else setLoading(false)
    return () => window.removeEventListener('auth-expired', clearSession)
  }, [])

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password)
    localStorage.setItem('auth_token', res.access_token)
    localStorage.setItem('auth_user', JSON.stringify(res.user))
    setUser(res.user)
    setSessionExpired(false)
    return res.user
  }

  const register = async (p: { company_name: string; name: string; email: string; password: string }) => {
    const res = await authApi.register(p)
    localStorage.setItem('auth_token', res.access_token)
    localStorage.setItem('auth_user', JSON.stringify(res.user))
    setUser(res.user)
    setSessionExpired(false)
  }

  const acceptInvite = async (token: string, p: { password: string; phone?: string }) => {
    const res = await authApi.acceptInvitation(token, p)
    localStorage.setItem('auth_token', res.access_token)
    localStorage.setItem('auth_user', JSON.stringify(res.user))
    setUser(res.user)
    setSessionExpired(false)
    return res.user
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    setUser(null)
    setSessionExpired(false)
  }

  return (
    <AuthContext.Provider value={{ user, loading, sessionExpired, login, register, acceptInvite, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
