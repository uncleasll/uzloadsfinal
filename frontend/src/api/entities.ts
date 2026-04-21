import client from './client'
import type { Driver, Truck, Trailer, Broker, Dispatcher } from '@/types'

const V1 = '/api/v1'

export const driversApi = {
  list: async (isActive?: boolean): Promise<Driver[]> => {
    const params = isActive !== undefined ? { is_active: isActive } : {}
    const { data } = await client.get(`${V1}/drivers`, { params })
    return data
  },
  create: async (payload: Partial<Driver>): Promise<Driver> => {
    const { data } = await client.post(`${V1}/drivers`, payload)
    return data
  },
  update: async (id: number, payload: Partial<Driver>): Promise<Driver> => {
    const { data } = await client.put(`${V1}/drivers/${id}`, payload)
    return data
  },
}

export const trucksApi = {
  list: async (isActive?: boolean): Promise<Truck[]> => {
    const params = isActive !== undefined ? { is_active: isActive } : {}
    const { data } = await client.get(`${V1}/trucks`, { params })
    return data
  },
  get: async (id: number): Promise<Truck> => {
    const { data } = await client.get(`${V1}/trucks/${id}`)
    return data
  },
  create: async (payload: Partial<Truck>): Promise<Truck> => {
    const { data } = await client.post(`${V1}/trucks`, payload)
    return data
  },
  update: async (id: number, payload: Partial<Truck>): Promise<Truck> => {
    const { data } = await client.put(`${V1}/trucks/${id}`, payload)
    return data
  },
  delete: async (id: number): Promise<void> => {
    await client.delete(`${V1}/trucks/${id}`)
  },
  addDocument: async (truckId: number, payload: Record<string, unknown>) => {
    const { data } = await client.post(`${V1}/trucks/${truckId}/documents`, payload)
    return data
  },
  updateDocument: async (truckId: number, docId: number, payload: Record<string, unknown>) => {
    const { data } = await client.put(`${V1}/trucks/${truckId}/documents/${docId}`, payload)
    return data
  },
  deleteDocument: async (truckId: number, docId: number) => {
    await client.delete(`${V1}/trucks/${truckId}/documents/${docId}`)
  },
}

export const trailersApi = {
  list: async (isActive?: boolean): Promise<Trailer[]> => {
    const params = isActive !== undefined ? { is_active: isActive } : {}
    const { data } = await client.get(`${V1}/trailers`, { params })
    return data
  },
  get: async (id: number): Promise<Trailer> => {
    const { data } = await client.get(`${V1}/trailers/${id}`)
    return data
  },
  create: async (payload: Partial<Trailer>): Promise<Trailer> => {
    const { data } = await client.post(`${V1}/trailers`, payload)
    return data
  },
  update: async (id: number, payload: Partial<Trailer>): Promise<Trailer> => {
    const { data } = await client.put(`${V1}/trailers/${id}`, payload)
    return data
  },
  delete: async (id: number): Promise<void> => {
    await client.delete(`${V1}/trailers/${id}`)
  },
  addDocument: async (trailerId: number, payload: Record<string, unknown>) => {
    const { data } = await client.post(`${V1}/trailers/${trailerId}/documents`, payload)
    return data
  },
  updateDocument: async (trailerId: number, docId: number, payload: Record<string, unknown>) => {
    const { data } = await client.put(`${V1}/trailers/${trailerId}/documents/${docId}`, payload)
    return data
  },
  deleteDocument: async (trailerId: number, docId: number) => {
    await client.delete(`${V1}/trailers/${trailerId}/documents/${docId}`)
  },
}

export const brokersApi = {
  list: async (isActive?: boolean): Promise<Broker[]> => {
    const params = isActive !== undefined ? { is_active: isActive } : {}
    const { data } = await client.get(`${V1}/brokers`, { params })
    return data
  },
  create: async (payload: Partial<Broker>): Promise<Broker> => {
    const { data } = await client.post(`${V1}/brokers`, payload)
    return data
  },
}

export const dispatchersApi = {
  list: async (isActive?: boolean): Promise<Dispatcher[]> => {
    const params = isActive !== undefined ? { is_active: isActive } : {}
    const { data } = await client.get(`${V1}/dispatchers`, { params })
    return data
  },
}
