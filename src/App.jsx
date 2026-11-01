import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CloudOff,
  Cloudy,
  Download,
  Gauge,
  Leaf,
  MapPinned,
  MonitorCog,
  Route,
  ShieldAlert,
  Signal,
  ThermometerSun,
  TimerReset,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'

const STORAGE_KEY = 'hariyali-coldguard-state-v1'
const stageOrder = ['collection', 'transport', 'market']
const stageLabels = {
  collection: 'Collection Centre',
  transport: 'Transport',
  market: 'Market',
}

const defaultSettings = {
  warningThresholdC: 18,
  criticalThresholdC: 24,
  requiredDurationMinutes: 8,
  updateIntervalMs: 5000,
  produceType: 'Tomato',
  journeyStage: 'transport',
}

const defaultDevices = [
  { id: 'SIM-DEVICE-001', name: 'ColdBox A1', journeyId: 'JOURNEY-001', status: 'active', lastReading: '', batteryLevel: 91, connectivity: 'connected', sensorStatus: 'simulated', location: 'Collection Centre' },
  { id: 'SIM-DEVICE-002', name: 'ColdBox B3', journeyId: 'JOURNEY-001', status: 'monitoring', lastReading: '', batteryLevel: 76, connectivity: 'connected', sensorStatus: 'simulated', location: 'Transport' },
  { id: 'SIM-DEVICE-003', name: 'ColdBox C4', journeyId: 'JOURNEY-001', status: 'standby', lastReading: '', batteryLevel: 58, connectivity: 'offline', sensorStatus: 'fault', location: 'Market' },
]

const navItems = [
  { key: 'overview', label: 'Overview', icon: Gauge },
  { key: 'monitoring', label: 'Live Monitoring', icon: Activity },
  { key: 'analytics', label: 'Journey Analytics', icon: Route },
  { key: 'alerts', label: 'Alerts & Events', icon: Bell },
  { key: 'devices', label: 'Device Management', icon: MonitorCog },
  { key: 'reports', label: 'Reports', icon: Download },
  { key: 'settings', label: 'System Settings', icon: ShieldAlert },
]

const riskStateClass = {
  NORMAL: 'normal',
  WARNING: 'warning',
  CRITICAL: 'critical',
  'SENSOR FAULT': 'fault',
}

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function safeNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function buildReading({ journeyId, timestamp, stage, previousTemp = 15, previousHumidity = 70, networkConnected = true, sensorFault = false }) {
  const time = timestamp || new Date().toISOString()
  const trend = Math.sin((previousTemp + previousHumidity) / 14) * 1.4
  const humidityTrend = Math.cos((previousHumidity + previousTemp) / 17) * 2.5

  let temp = previousTemp + trend * 0.8
  let humidity = previousHumidity + humidityTrend

  if (stage === 'market') {
    temp += 2.1
    humidity += 2.8
  } else if (stage === 'collection') {
    temp -= 1.4
    humidity -= 1.1
  }

  if (sensorFault) {
    temp = Number.NaN
    humidity = Number.NaN
  }

  return {
    id: makeId('reading'),
    timestamp: time,
    journeyId,
    deviceId: 'SIM-DEVICE-001',
    stage,
    temperatureC: Number.isFinite(temp) ? Number(temp.toFixed(1)) : null,
    humidityPercent: Number.isFinite(humidity) ? Number(humidity.toFixed(1)) : null,
    sensorStatus: sensorFault ? 'fault' : 'simulated',
    networkStatus: networkConnected ? 'connected' : 'offline',
    syncStatus: networkConnected ? 'synced' : 'pending',
  }
}

function createInitialReadings(journeyId) {
  const now = Date.now()
  const baseTemp = 16.4
  const baseHumidity = 69.4
  return Array.from({ length: 18 }, (_, index) => {
    const stage = stageOrder[index % stageOrder.length]
    const timestamp = new Date(now - (17 - index) * 6 * 60 * 1000).toISOString()
    const temp = baseTemp + Math.sin(index / 2.2) * 2.8 + (stage === 'market' ? 2.5 : stage === 'collection' ? -1.6 : 0.6)
    const humidity = baseHumidity + Math.cos(index / 2.8) * 6.8 + (stage === 'market' ? 2.5 : 0)
    return {
      id: makeId('reading'),
      timestamp,
      journeyId,
      deviceId: index % 2 === 0 ? 'SIM-DEVICE-001' : 'SIM-DEVICE-002',
      stage,
      temperatureC: Number(temp.toFixed(1)),
      humidityPercent: Number(humidity.toFixed(1)),
      sensorStatus: 'simulated',
      networkStatus: 'connected',
      syncStatus: 'synced',
    }
  })
}

function buildInitialState() {
  const journeyId = 'JOURNEY-001'
  const now = new Date().toISOString()
  const readings = createInitialReadings(journeyId)

  return {
    settings: { ...defaultSettings },
    journey: {
      id: journeyId,
      startedAt: now,
      elapsedSeconds: 12 * 60 * 60,
      stage: 'transport',
      progress: 62,
    },
    readings,
    alerts: [{
      id: 'alert-001',
      timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
      severity: 'warning',
      category: 'temperature_warning',
      description: 'Temperature reached a warning threshold during an earlier monitoring interval.',
      journey: journeyId,
      acknowledged: false,
    }],
    devices: defaultDevices.map((device) => ({
      ...device,
      lastReading: now,
    })),
    selectedSection: 'overview',
    timeRange: '6h',
    simulationRunning: false,
    networkConnected: true,
    sensorFault: false,
    activeExcursion: false,
    activeExcursionStart: null,
    pendingSync: 0,
    synchronizedRecords: 0,
    lastReadingTime: now,
  }
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return buildInitialState()
    const parsed = JSON.parse(raw)
    return {
      ...buildInitialState(),
      ...parsed,
      settings: { ...defaultSettings, ...(parsed.settings || {}) },
      journey: { ...buildInitialState().journey, ...(parsed.journey || {}) },
      readings: Array.isArray(parsed.readings) && parsed.readings.length ? parsed.readings : createInitialReadings('JOURNEY-001'),
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
      devices: Array.isArray(parsed.devices) && parsed.devices.length ? parsed.devices : defaultDevices,
    }
  } catch (error) {
    console.warn('Unable to restore persisted state.', error)
    return buildInitialState()
  }
}

function getRiskStatus(readings, settings, sensorFault, networkConnected) {
  const latest = readings[readings.length - 1]
  if (sensorFault || !latest || !Number.isFinite(latest.temperatureC)) return 'SENSOR FAULT'
  if (!networkConnected) return 'WARNING'
  if (latest.temperatureC >= settings.criticalThresholdC) return 'CRITICAL'
  if (latest.temperatureC >= settings.warningThresholdC) return 'WARNING'
  return 'NORMAL'
}

function App() {
  const [state, setState] = useState(() => loadState())
  const timerRef = useRef(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (error) {
      console.warn('Unable to persist application state.', error)
    }
  }, [state])

  const latestReading = state.readings[state.readings.length - 1] || null
  const riskStatus = getRiskStatus(state.readings, state.settings, state.sensorFault, state.networkConnected)
  const activeAlerts = state.alerts.filter((alert) => !alert.acknowledged)
  const analyticsMetrics = useMemo(() => {
    const validTemps = state.readings.map((reading) => safeNumber(reading.temperatureC, null)).filter((value) => value !== null)
    const validHum = state.readings.map((reading) => safeNumber(reading.humidityPercent, null)).filter((value) => value !== null)
    const avgTemp = validTemps.length ? validTemps.reduce((sum, value) => sum + value, 0) / validTemps.length : 0
    const avgHumidity = validHum.length ? validHum.reduce((sum, value) => sum + value, 0) / validHum.length : 0
    const minTemp = validTemps.length ? Math.min(...validTemps) : 0
    const maxTemp = validTemps.length ? Math.max(...validTemps) : 0
    const outsideRangeMinutes = state.readings.filter((reading) => Number.isFinite(reading.temperatureC) && (reading.temperatureC < state.settings.warningThresholdC || reading.temperatureC > state.settings.criticalThresholdC)).length * 5
    return { avgTemp, avgHumidity, minTemp, maxTemp, outsideRangeMinutes }
  }, [state.readings, state.settings.warningThresholdC, state.settings.criticalThresholdC])

  const filteredReadings = useMemo(() => {
    const windows = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      all: Infinity,
    }
    const cutoff = windows[state.timeRange] || windows['6h']
    if (!Number.isFinite(cutoff)) return state.readings
    const nowMs = Date.now()
    return state.readings.filter((reading) => new Date(reading.timestamp).getTime() >= nowMs - cutoff)
  }, [state.readings, state.timeRange])

  const addAlert = (alert, existingAlerts) => {
    const hasDuplicate = existingAlerts.some((item) => item.category === alert.category && item.acknowledged === alert.acknowledged)
    if (hasDuplicate) return existingAlerts
    return [alert, ...existingAlerts]
  }

  const startSimulation = () => {
    setState((previous) => ({ ...previous, simulationRunning: true }))
  }

  const pauseSimulation = () => {
    setState((previous) => ({ ...previous, simulationRunning: false }))
  }

  const setSection = (section) => {
    setState((previous) => ({ ...previous, selectedSection: section }))
  }

  const syncPendingReadings = () => {
    setState((previous) => {
      const synced = previous.readings.filter((reading) => reading.networkStatus === 'offline' && reading.syncStatus === 'pending').length
      const nextReadings = previous.readings.map((reading) => {
        if (reading.networkStatus === 'offline' && reading.syncStatus === 'pending') {
          return { ...reading, networkStatus: 'connected', syncStatus: 'synced' }
        }
        return reading
      })
      return {
        ...previous,
        readings: nextReadings,
        networkConnected: true,
        pendingSync: 0,
        synchronizedRecords: previous.synchronizedRecords + synced,
        alerts: addAlert({
          id: makeId('alert'),
          timestamp: new Date().toISOString(),
          severity: 'info',
          category: 'network_reconnect',
          description: 'Network reconnection simulated. Pending records were synchronized without duplication.',
          journey: previous.journey.id,
          acknowledged: false,
        }, previous.alerts),
      }
    })
  }

  const resetJourney = () => {
    const nextJourneyId = `JOURNEY-${Math.floor(Math.random() * 90 + 10)}`
    const now = new Date().toISOString()
    const nextReadings = createInitialReadings(nextJourneyId)
    setState((previous) => ({
      ...previous,
      journey: {
        id: nextJourneyId,
        startedAt: now,
        elapsedSeconds: 0,
        stage: previous.settings.journeyStage,
        progress: 0,
      },
      readings: nextReadings,
      alerts: [],
      devices: defaultDevices.map((device) => ({ ...device, lastReading: now, connectivity: 'connected', sensorStatus: 'simulated', batteryLevel: 80 })),
      sensorFault: false,
      networkConnected: true,
      simulationRunning: false,
      pendingSync: 0,
      synchronizedRecords: 0,
      activeExcursion: false,
      activeExcursionStart: null,
      lastReadingTime: now,
    }))
  }

  const toggleSensorFault = () => {
    setState((previous) => ({
      ...previous,
      sensorFault: !previous.sensorFault,
      alerts: addAlert({
        id: makeId('alert'),
        timestamp: new Date().toISOString(),
        severity: previous.sensorFault ? 'info' : 'critical',
        category: previous.sensorFault ? 'sensor_recovery' : 'sensor_fault',
        description: previous.sensorFault
          ? 'Sensor fault recovered. Measurements are valid again.'
          : 'Sensor fault simulated. Invalid measurements are excluded from risk calculations.',
        journey: previous.journey.id,
        acknowledged: false,
      }, previous.alerts),
    }))
  }

  const toggleNetwork = () => {
    setState((previous) => {
      const nextNetworkState = !previous.networkConnected
      const updatedReadings = previous.readings.map((reading) => ({
        ...reading,
        networkStatus: nextNetworkState ? 'connected' : 'offline',
        syncStatus: nextNetworkState ? (reading.syncStatus === 'pending' ? 'synced' : reading.syncStatus) : (reading.syncStatus === 'synced' ? 'pending' : reading.syncStatus),
      }))

      return {
        ...previous,
        networkConnected: nextNetworkState,
        readings: updatedReadings,
        pendingSync: nextNetworkState ? 0 : updatedReadings.filter((reading) => reading.syncStatus === 'pending').length,
        alerts: addAlert({
          id: makeId('alert'),
          timestamp: new Date().toISOString(),
          severity: nextNetworkState ? 'info' : 'warning',
          category: nextNetworkState ? 'network_reconnect' : 'network_disconnection',
          description: nextNetworkState
            ? 'Connectivity restored. Offline records can synchronize.'
            : 'Network disruption simulated. Readings remain local until reconnection.',
          journey: previous.journey.id,
          acknowledged: false,
        }, previous.alerts),
      }
    })
  }

  const changeJourneyStage = () => {
    setState((previous) => {
      const currentIndex = stageOrder.indexOf(previous.journey.stage)
      const nextStage = stageOrder[(currentIndex + 1) % stageOrder.length]
      return {
        ...previous,
        journey: {
          ...previous.journey,
          stage: nextStage,
          progress: clamp(Math.round(((currentIndex + 1) / stageOrder.length) * 100), 0, 100),
        },
        alerts: addAlert({
          id: makeId('alert'),
          timestamp: new Date().toISOString(),
          severity: 'info',
          category: 'journey_stage_change',
          description: `Journey stage changed to ${stageLabels[nextStage]} for demonstration purposes.`,
          journey: previous.journey.id,
          acknowledged: false,
        }, previous.alerts),
      }
    })
  }

  const generateTemperatureExcursion = () => {
    setState((previous) => {
      const nextReading = buildReading({
        journeyId: previous.journey.id,
        timestamp: new Date().toISOString(),
        stage: previous.journey.stage,
        previousTemp: safeNumber(previous.readings[previous.readings.length - 1]?.temperatureC, 16),
        previousHumidity: safeNumber(previous.readings[previous.readings.length - 1]?.humidityPercent, 71),
        networkConnected: previous.networkConnected,
        sensorFault: previous.sensorFault,
      })
      const excursionTemp = safeNumber(nextReading.temperatureC, 20) + 10
      const readingWithExcursion = {
        ...nextReading,
        temperatureC: Number(excursionTemp.toFixed(1)),
        humidityPercent: Number(clamp(safeNumber(nextReading.humidityPercent, 70) - 4, 35, 95).toFixed(1)),
        networkStatus: previous.networkConnected ? 'connected' : 'offline',
        syncStatus: previous.networkConnected ? 'synced' : 'pending',
      }

      return {
        ...previous,
        readings: [...previous.readings, readingWithExcursion].slice(-240),
        activeExcursion: true,
        activeExcursionStart: new Date().toISOString(),
        alerts: addAlert({
          id: makeId('alert'),
          timestamp: new Date().toISOString(),
          severity: 'warning',
          category: 'temperature_warning',
          description: `Manual temperature excursion injected at ${excursionTemp.toFixed(1)}°C above the configured threshold.`,
          journey: previous.journey.id,
          acknowledged: false,
        }, previous.alerts),
      }
    })
  }

  const acknowledgeAlert = (alertId) => {
    setState((previous) => ({
      ...previous,
      alerts: previous.alerts.map((alert) => (alert.id === alertId ? { ...alert, acknowledged: true } : alert)),
    }))
  }

  const acknowledgeAll = () => {
    setState((previous) => ({
      ...previous,
      alerts: previous.alerts.map((alert) => ({ ...alert, acknowledged: true })),
    }))
  }

  const updateSettings = (field, value) => {
    setState((previous) => ({
      ...previous,
      settings: {
        ...previous.settings,
        [field]: value,
      },
    }))
  }

  const exportCsv = () => {
    const headers = ['timestamp', 'journeyId', 'deviceId', 'stage', 'temperatureC', 'humidityPercent', 'networkStatus', 'syncStatus']
    const rows = state.readings.map((reading) => [
      reading.timestamp,
      reading.journeyId,
      reading.deviceId,
      reading.stage,
      reading.temperatureC ?? '',
      reading.humidityPercent ?? '',
      reading.networkStatus,
      reading.syncStatus,
    ])

    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `hariyali-readings-${state.journey.id}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    if (!state.simulationRunning) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return undefined
    }

    timerRef.current = setInterval(() => {
      setState((previous) => {
        const nextTimestamp = new Date().toISOString()
        const previousReading = previous.readings[previous.readings.length - 1] || null
        const lastTemp = safeNumber(previousReading?.temperatureC, 16.5)
        const lastHumidity = safeNumber(previousReading?.humidityPercent, 69)
        const nextStage = previous.journey.stage

        const generatedReading = buildReading({
          journeyId: previous.journey.id,
          timestamp: nextTimestamp,
          stage: nextStage,
          previousTemp: lastTemp,
          previousHumidity: lastHumidity,
          networkConnected: previous.networkConnected,
          sensorFault: previous.sensorFault,
        })

        const nextReadings = [...previous.readings, generatedReading].slice(-240)
        const pendingCount = nextReadings.filter((reading) => reading.syncStatus === 'pending').length
        const shouldWarn = !previous.sensorFault && Number.isFinite(generatedReading.temperatureC) && generatedReading.temperatureC >= previous.settings.warningThresholdC
        const shouldCritical = !previous.sensorFault && Number.isFinite(generatedReading.temperatureC) && generatedReading.temperatureC >= previous.settings.criticalThresholdC

        let alerts = previous.alerts
        if (shouldWarn && !previous.activeExcursion) {
          alerts = addAlert({
            id: makeId('alert'),
            timestamp: nextTimestamp,
            severity: shouldCritical ? 'critical' : 'warning',
            category: 'temperature_warning',
            description: `Temperature reached ${generatedReading.temperatureC.toFixed(1)}°C, exceeding the configured warning threshold.`,
            journey: previous.journey.id,
            acknowledged: false,
          }, alerts)
        }

        const excursionThresholdMs = previous.settings.requiredDurationMinutes * 60 * 1000
        if (shouldWarn && previous.activeExcursionStart) {
          const excursionDuration = new Date(nextTimestamp).getTime() - new Date(previous.activeExcursionStart).getTime()
          if (excursionDuration >= excursionThresholdMs && !alerts.some((alert) => alert.category === 'sustained_temperature_excursion' && !alert.acknowledged)) {
            alerts = addAlert({
              id: makeId('alert'),
              timestamp: nextTimestamp,
              severity: shouldCritical ? 'critical' : 'warning',
              category: 'sustained_temperature_excursion',
              description: `Sustained temperature excursion exceeded ${previous.settings.requiredDurationMinutes} minutes above the configured threshold.`,
              journey: previous.journey.id,
              acknowledged: false,
            }, alerts)
          }
        }

        if (previous.networkConnected && previous.readings.length && previous.readings[previous.readings.length - 1].syncStatus === 'pending') {
          // no-op: the network status is already handled by toggle function for demo control
        }

        const nextJourney = {
          ...previous.journey,
          elapsedSeconds: previous.journey.elapsedSeconds + previous.settings.updateIntervalMs / 1000,
          progress: clamp(Math.round((previous.journey.elapsedSeconds / 18000) * 100), 0, 100),
        }

        return {
          ...previous,
          readings: nextReadings,
          alerts,
          journey: nextJourney,
          activeExcursion: shouldWarn,
          activeExcursionStart: shouldWarn ? previous.activeExcursionStart || nextTimestamp : null,
          pendingSync: previous.networkConnected ? 0 : pendingCount,
          lastReadingTime: nextTimestamp,
          devices: previous.devices.map((device) => ({
            ...device,
            batteryLevel: clamp(device.batteryLevel - 0.2, 10, 100),
            connectivity: previous.networkConnected ? 'connected' : 'offline',
            sensorStatus: previous.sensorFault ? 'fault' : 'simulated',
            lastReading: nextTimestamp,
          })),
        }
      })
    }, state.settings.updateIntervalMs)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [state.simulationRunning, state.settings.updateIntervalMs])

  const renderOverview = () => (
    <div className="page-layout">
      <div className="summary-grid">
        <StatCard label="Current temperature" value={`${latestReading?.temperatureC ?? '—'}°C`} note="SIMULATED" icon={<ThermometerSun size={18} />} tone="green" />
        <StatCard label="Relative humidity" value={`${latestReading?.humidityPercent ?? '—'}%`} note="SIMULATED" icon={<Cloudy size={18} />} tone="teal" />
        <StatCard label="Active alerts" value={String(activeAlerts.length)} note="Unacknowledged" icon={<Bell size={18} />} tone="amber" />
        <StatCard label="Total readings" value={String(state.readings.length)} note="Stored locally" icon={<Leaf size={18} />} tone="green" />
        <StatCard label="Network status" value={state.networkConnected ? 'Connected' : 'Offline'} note={state.networkConnected ? 'SIMULATED' : 'OFFLINE MODE'} icon={state.networkConnected ? <Wifi size={18} /> : <WifiOff size={18} />} tone={state.networkConnected ? 'green' : 'red'} />
        <StatCard label="Simulation progress" value={`${state.journey.progress}%`} note={stageLabels[state.journey.stage]} icon={<MapPinned size={18} />} tone="blue" />
      </div>

      <div className="dashboard-grid two-up">
        <section className="panel chart-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Live monitoring</p>
              <h3>Temperature and humidity trend</h3>
            </div>
            <select value={state.timeRange} onChange={(event) => setState((previous) => ({ ...previous, timeRange: event.target.value }))}>
              <option value="1h">Last 1 hour</option>
              <option value="6h">Last 6 hours</option>
              <option value="24h">Last 24 hours</option>
              <option value="all">Full journey</option>
            </select>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredReadings}>
                <CartesianGrid stroke="#20313a" strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} minTickGap={18} stroke="#8aa0a5" />
                <YAxis yAxisId="left" domain={[8, 34]} stroke="#8aa0a5" />
                <YAxis yAxisId="right" orientation="right" domain={[40, 100]} stroke="#8aa0a5" />
                <Tooltip />
                <ReferenceLine y={state.settings.warningThresholdC} yAxisId="left" stroke="#7dd3fc" strokeDasharray="4 4" label={{ value: 'Warning', fill: '#7dd3fc' }} />
                <Line yAxisId="left" type="monotone" dataKey="temperatureC" stroke="#7FE7B1" strokeWidth={2.5} dot={false} name="Temperature °C" />
                <Line yAxisId="right" type="monotone" dataKey="humidityPercent" stroke="#8BB8FF" strokeWidth={2.2} dot={false} name="Humidity %" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Journey status</p>
              <h3>Transport workflow</h3>
            </div>
          </div>
          <div className="journey-node-row">
            {stageOrder.map((stage) => (
              <div key={stage} className={`stage-node ${state.journey.stage === stage ? 'active' : ''}`}>
                {stageLabels[stage]}
              </div>
            ))}
          </div>
          <div className="progress-bar-box">
            <div className="progress-bar-fill" style={{ width: `${state.journey.progress}%` }} />
          </div>
          <div className="journey-meta-grid">
            <div><span>Current stage</span><strong>{stageLabels[state.journey.stage]}</strong></div>
            <div><span>Journey ID</span><strong>{state.journey.id}</strong></div>
            <div><span>Elapsed time</span><strong>{formatDuration(state.journey.elapsedSeconds)}</strong></div>
            <div><span>Alerts</span><strong>{state.alerts.length}</strong></div>
          </div>
        </section>
      </div>

      <div className="dashboard-grid two-up">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">System health</p>
              <h3>Risk summary</h3>
            </div>
          </div>
          <div className={`risk-badge ${riskStateClass[riskStatus] || 'normal'}`}>{riskStatus}</div>
          <ul className="stack-list">
            <li><span>Warning threshold</span><strong>{state.settings.warningThresholdC}°C</strong></li>
            <li><span>Critical threshold</span><strong>{state.settings.criticalThresholdC}°C</strong></li>
            <li><span>Offline mode</span><strong>{state.networkConnected ? 'Disabled' : 'Enabled'}</strong></li>
            <li><span>Sensor health</span><strong>{state.sensorFault ? 'Faulted' : 'Healthy'}</strong></li>
          </ul>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Controls</p>
              <h3>Simulation engine</h3>
            </div>
          </div>
          <div className="button-grid compact">
            <button onClick={startSimulation}>Start</button>
            <button onClick={pauseSimulation}>Pause</button>
            <button onClick={resetJourney}>Reset</button>
            <button onClick={generateTemperatureExcursion}>Excursion</button>
            <button onClick={toggleSensorFault}>Sensor fault</button>
            <button onClick={toggleNetwork}>{state.networkConnected ? 'Offline' : 'Reconnect'}</button>
            <button onClick={changeJourneyStage}>Change stage</button>
            <button onClick={syncPendingReadings}>Sync pending</button>
          </div>
        </section>
      </div>
    </div>
  )

  const renderMonitoring = () => (
    <div className="page-layout">
      <section className="panel chart-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Simulation view</p>
            <h3>Environmental sensor stream</h3>
          </div>
          <div className="simple-inline"><span className={`status-dot ${state.simulationRunning ? 'live' : ''}`} />{state.simulationRunning ? 'Simulation running' : 'Simulation paused'}</div>
        </div>
        <div className="chart-wrap large">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredReadings}>
              <defs>
                <linearGradient id="tempFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#7fe7b1" stopOpacity={0.8} />
                  <stop offset="100%" stopColor="#7fe7b1" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#20313a" strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} minTickGap={22} stroke="#8aa0a5" />
              <YAxis domain={[8, 34]} stroke="#8aa0a5" />
              <Tooltip />
              <ReferenceLine y={state.settings.warningThresholdC} stroke="#7dd3fc" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="temperatureC" stroke="#7fe7b1" fill="url(#tempFill)" name="Temperature °C" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="dashboard-grid two-up">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Operational notes</p>
              <h3>Threshold configuration</h3>
            </div>
          </div>
          <div className="settings-grid narrow">
            <div className="setting-row"><label>Warning threshold</label><input type="number" step="0.5" value={state.settings.warningThresholdC} onChange={(event) => updateSettings('warningThresholdC', Number(event.target.value))} /></div>
            <div className="setting-row"><label>Critical threshold</label><input type="number" step="0.5" value={state.settings.criticalThresholdC} onChange={(event) => updateSettings('criticalThresholdC', Number(event.target.value))} /></div>
            <div className="setting-row"><label>Excursion duration (min)</label><input type="number" min="1" value={state.settings.requiredDurationMinutes} onChange={(event) => updateSettings('requiredDurationMinutes', Number(event.target.value))} /></div>
            <div className="setting-row"><label>Update interval (ms)</label><input type="number" min="1000" value={state.settings.updateIntervalMs} onChange={(event) => updateSettings('updateIntervalMs', Number(event.target.value))} /></div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Offline-first behaviour</p>
              <h3>Connectivity</h3>
            </div>
          </div>
          <div className="network-banner">
            {state.networkConnected ? <Wifi size={18} /> : <CloudOff size={18} />}
            <div>
              <strong>{state.networkConnected ? 'Connected' : 'Offline mode active'}</strong>
              <p>{state.networkConnected ? 'Consumer communication is being simulated in real time.' : 'Offline mode continues monitoring and storing readings locally without claiming real cloud sync.'}</p>
            </div>
          </div>
          <ul className="stack-list mini">
            <li><span>Pending sync</span><strong>{state.pendingSync}</strong></li>
            <li><span>Synced records</span><strong>{state.synchronizedRecords}</strong></li>
            <li><span>Readings retained</span><strong>{state.readings.length}</strong></li>
          </ul>
        </section>
      </div>
    </div>
  )

  const renderAnalytics = () => {
    const metrics = analyticsMetrics

    const stageBreakdown = stageOrder.map((stage) => ({
      stage: stageLabels[stage],
      readings: state.readings.filter((reading) => reading.stage === stage).length,
      alerts: state.alerts.filter((alert) => alert.category && alert.description.includes(stageLabels[stage])).length,
    }))

    return (
      <div className="page-layout">
        <div className="summary-grid analytics-grid">
          <StatCard label="Average temperature" value={`${metrics.avgTemp.toFixed(1)}°C`} note="Observation" icon={<ThermometerSun size={18} />} tone="green" />
          <StatCard label="Average humidity" value={`${metrics.avgHumidity.toFixed(1)}%`} note="Observation" icon={<Cloudy size={18} />} tone="teal" />
          <StatCard label="Min temperature" value={`${metrics.minTemp.toFixed(1)}°C`} note="Recorded" icon={<ArrowUpRight size={18} />} tone="amber" />
          <StatCard label="Max temperature" value={`${metrics.maxTemp.toFixed(1)}°C`} note="Recorded" icon={<AlertTriangle size={18} />} tone="red" />
          <StatCard label="Time outside range" value={`${metrics.outsideRangeMinutes} min`} note="Estimated" icon={<TimerReset size={18} />} tone="blue" />
          <StatCard label="Invalid readings" value={String(state.readings.filter((reading) => !Number.isFinite(reading.temperatureC)).length)} note="Fault excluded" icon={<ShieldAlert size={18} />} tone="red" />
        </div>

        <div className="dashboard-grid two-up">
          <section className="panel chart-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Journey analysis</p>
                <h3>Temperature history</h3>
              </div>
            </div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={filteredReadings}>
                  <CartesianGrid stroke="#20313a" strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} minTickGap={18} stroke="#8aa0a5" />
                  <YAxis stroke="#8aa0a5" />
                  <Tooltip />
                  <ReferenceLine y={state.settings.warningThresholdC} stroke="#7dd3fc" strokeDasharray="4 4" />
                  <ReferenceLine y={state.settings.criticalThresholdC} stroke="#fda4af" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="temperatureC" stroke="#7FE7B1" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Alert distribution</p>
                <h3>By journey stage</h3>
              </div>
            </div>
            <ul className="stack-list">
              {stageBreakdown.map((item) => (
                <li key={item.stage}><span>{item.stage}</span><strong>{item.readings} readings</strong></li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    )
  }

  const renderAlerts = () => (
    <div className="page-layout">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Alerting</p>
            <h3>Alert history</h3>
          </div>
          <div className="inline-buttons">
            <select defaultValue="all">
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
            <button onClick={acknowledgeAll}>Acknowledge all</button>
          </div>
        </div>

        {state.alerts.length === 0 ? (
          <div className="empty-state">
            <AlertTriangle size={20} />
            <p>No alerts recorded for this journey. The system is stable.</p>
          </div>
        ) : (
          <div className="alert-list">
            {state.alerts.map((alert) => (
              <div key={alert.id} className={`alert-item ${alert.acknowledged ? 'acknowledged' : ''}`}>
                <div className="alert-meta">
                  <span className={`severity-pill ${alert.severity}`}>{alert.severity}</span>
                  <span className="alert-category">{alert.category}</span>
                  <span>{formatDateTime(alert.timestamp)}</span>
                </div>
                <p>{alert.description}</p>
                <div className="alert-footer">
                  <small>Journey: {alert.journey}</small>
                  {!alert.acknowledged && <button onClick={() => acknowledgeAlert(alert.id)}>Acknowledge</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )

  const renderDevices = () => (
    <div className="page-layout">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Field hardware</p>
            <h3>Simulated device inventory</h3>
          </div>
        </div>
        <div className="device-grid">
          {state.devices.map((device) => (
            <div key={device.id} className="device-card">
              <div className="device-topline">
                <div>
                  <h4>{device.name}</h4>
                  <small>{device.id}</small>
                </div>
                <span className={`status-pill ${device.status}`}>{device.status}</span>
              </div>
              <dl>
                <div><dt>Journey</dt><dd>{device.journeyId}</dd></div>
                <div><dt>Location</dt><dd>{device.location}</dd></div>
                <div><dt>Last reading</dt><dd>{formatDateTime(device.lastReading)}</dd></div>
                <div><dt>Battery</dt><dd>{device.batteryLevel.toFixed(0)}% (simulated telemetry)</dd></div>
                <div><dt>Connectivity</dt><dd>{device.connectivity}</dd></div>
                <div><dt>Sensor</dt><dd>{device.sensorStatus}</dd></div>
              </dl>
            </div>
          ))}
        </div>
      </section>
    </div>
  )

  const renderReports = () => (
    <div className="page-layout">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Reporting</p>
            <h3>Journey report</h3>
          </div>
          <div className="inline-buttons">
            <button onClick={exportCsv}>Export CSV</button>
            <button onClick={() => window.print()}>Print report</button>
          </div>
        </div>
        <div className="report-grid">
          <div className="report-card">
            <h4>Journey summary</h4>
            <ul>
              <li><span>Journey ID</span><strong>{state.journey.id}</strong></li>
              <li><span>Current stage</span><strong>{stageLabels[state.journey.stage]}</strong></li>
              <li><span>Elapsed time</span><strong>{formatDuration(state.journey.elapsedSeconds)}</strong></li>
              <li><span>Recorded readings</span><strong>{state.readings.length}</strong></li>
              <li><span>Baseline spoilage figure</span><strong>18% (project baseline)</strong></li>
            </ul>
          </div>
          <div className="report-card">
            <h4>Temperature statistics</h4>
            <ul>
              <li><span>Mean</span><strong>{(state.readings.reduce((sum, reading) => sum + safeNumber(reading.temperatureC, 0), 0) / Math.max(1, state.readings.length)).toFixed(1)}°C</strong></li>
              <li><span>Highest</span><strong>{Math.max(...state.readings.map((reading) => safeNumber(reading.temperatureC, 0))).toFixed(1)}°C</strong></li>
              <li><span>Lowest</span><strong>{Math.min(...state.readings.map((reading) => safeNumber(reading.temperatureC, 0))).toFixed(1)}°C</strong></li>
            </ul>
          </div>
          <div className="report-card">
            <h4>Humidity statistics</h4>
            <ul>
              <li><span>Mean</span><strong>{(state.readings.reduce((sum, reading) => sum + safeNumber(reading.humidityPercent, 0), 0) / Math.max(1, state.readings.length)).toFixed(1)}%</strong></li>
              <li><span>Peak</span><strong>{Math.max(...state.readings.map((reading) => safeNumber(reading.humidityPercent, 0))).toFixed(1)}%</strong></li>
              <li><span>Low</span><strong>{Math.min(...state.readings.map((reading) => safeNumber(reading.humidityPercent, 0))).toFixed(1)}%</strong></li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )

  const renderSettings = () => (
    <div className="page-layout">
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Configuration</p>
            <h3>System settings</h3>
          </div>
        </div>
        <div className="settings-grid">
          <div className="setting-row"><label>Temperature warning threshold (°C)</label><input type="number" value={state.settings.warningThresholdC} onChange={(event) => updateSettings('warningThresholdC', Number(event.target.value))} /></div>
          <div className="setting-row"><label>Temperature critical threshold (°C)</label><input type="number" value={state.settings.criticalThresholdC} onChange={(event) => updateSettings('criticalThresholdC', Number(event.target.value))} /></div>
          <div className="setting-row"><label>Required duration for sustained excursion (min)</label><input type="number" value={state.settings.requiredDurationMinutes} onChange={(event) => updateSettings('requiredDurationMinutes', Number(event.target.value))} /></div>
          <div className="setting-row"><label>Simulation update interval (ms)</label><input type="number" value={state.settings.updateIntervalMs} onChange={(event) => updateSettings('updateIntervalMs', Number(event.target.value))} /></div>
          <div className="setting-row"><label>Selected produce type</label><input type="text" value={state.settings.produceType} onChange={(event) => updateSettings('produceType', event.target.value)} /></div>
          <div className="setting-row"><label>Demonstration journey stage</label><select value={state.settings.journeyStage} onChange={(event) => updateSettings('journeyStage', event.target.value)}>
            {stageOrder.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}
          </select></div>
        </div>
        <div className="inline-note">
          <ShieldAlert size={16} />
          <p>These defaults are demonstration settings and should be verified before any field deployment.</p>
        </div>
      </section>
    </div>
  )

  const renderSection = () => {
    switch (state.selectedSection) {
      case 'overview':
        return renderOverview()
      case 'monitoring':
        return renderMonitoring()
      case 'analytics':
        return renderAnalytics()
      case 'alerts':
        return renderAlerts()
      case 'devices':
        return renderDevices()
      case 'reports':
        return renderReports()
      case 'settings':
        return renderSettings()
      default:
        return renderOverview()
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark"><Leaf size={18} /></div>
          <div>
            <strong>Hariyali ColdGuard</strong>
            <small>Cold-chain monitoring</small>
          </div>
        </div>

        <nav className="nav-menu" aria-label="Primary navigation">
          {navItems.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" className={state.selectedSection === key ? 'nav-item active' : 'nav-item'} onClick={() => setSection(key)}>
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <div className="status-inline"><Signal size={16} /><span>{state.networkConnected ? 'Connected' : 'Offline'}</span></div>
            <div className="status-inline muted"><Zap size={16} /><span>SIMULATED</span></div>
            <div className="status-inline muted"><Route size={16} /><span>{state.journey.id}</span></div>
          </div>
          <div className="topbar-right">
            <div className="user-badge"><div className="avatar">HC</div><span>Operator</span></div>
          </div>
        </header>

        <div className="content-wrap">{renderSection()}</div>
      </main>
    </div>
  )
}

function StatCard({ label, value, note, icon, tone }) {
  return (
    <article className={`stat-card ${tone}`}>
      <div className="stat-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  )
}

export default App
