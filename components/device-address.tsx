'use client'

import { useEffect, useState } from 'react'

export function DeviceAddress() {
  const [address, setAddress] = useState('Diese Geräteadresse')

  useEffect(() => {
    setAddress(window.location.hostname)
  }, [])

  return <p className="text-[11px] text-white/30">Dashboard · {address}</p>
}
