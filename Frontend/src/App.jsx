import React, { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

export default function App() {
  const [telemetry, setTelemetry] = useState(null)

  useEffect(() => {
    const socket = io('http://localhost:3000', { path: '/socket.io' })
    socket.on('connect', () => console.log('socket connected'))
    socket.on('telemetry', (msg) => setTelemetry(msg))
    return () => socket.close()
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui', padding: 16 }}>
      <h1>AquaChain Dashboard</h1>
      <p>Status: {telemetry ? 'Receiving' : 'Waiting for data...'}</p>
      <pre style={{ background: '#f6f8fa', padding: 12, borderRadius: 8 }}>
        {JSON.stringify(telemetry, null, 2)}
      </pre>
    </div>
  )
}

// Main App component