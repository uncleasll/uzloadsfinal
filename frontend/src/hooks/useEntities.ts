import { useState, useEffect } from 'react'
import { driversApi, trucksApi, trailersApi, brokersApi, dispatchersApi } from '@/api/entities'
import type { Driver, Truck, Trailer, Broker, Dispatcher } from '@/types'

export function useEntities() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [trailers, setTrailers] = useState<Trailer[]>([])
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      driversApi.list(true),
      trucksApi.list(true),
      trailersApi.list(true),
      brokersApi.list(true),
      dispatchersApi.list(true),
    ])
      .then(([d, t, tr, b, di]) => {
        setDrivers(d)
        setTrucks(t)
        setTrailers(tr)
        setBrokers(b)
        setDispatchers(di)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return { drivers, trucks, trailers, brokers, dispatchers, loading }
}
