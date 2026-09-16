import axios from 'axios'
import { announceDataChange } from './dataChanges'

const baseURL = import.meta.env.VITE_API_BASE_URL || ''

const client = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
  timeout: 30000,
})

client.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token')
  if (token && config.headers) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  res => {
    if (['post', 'put', 'patch', 'delete'].includes(res.config.method?.toLowerCase() || '') && !res.config.url?.includes('/auth/')) announceDataChange()
    return res
  },
  err => {
    const msg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Request failed'
    if (err.response?.status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
    }
    return Promise.reject(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)))
  }
)

export default client
