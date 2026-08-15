import { useEffect, useRef, useState } from 'react'
import type { Point } from '../types'

type MapPickerProps = {
  selection: 'origin' | 'destination'
  origin: Point | null
  destination: Point | null
  onSelect: (point: Point) => void
  onRouteUpdate: (route: RouteSummary | null, loading: boolean, error: string | null) => void
}

export type RouteSummary = {
  duration: string
  distance: string | null
}

const DEFAULT_CENTER: GoogleCoordinate = { lat: 55.75124, lng: 37.61842 }
let apiPromise: Promise<GoogleMapsApi> | null = null

type RoutesApiRoute = {
  duration?: string
  distanceMeters?: number
  polyline?: { encodedPolyline?: string }
  localizedValues?: {
    duration?: { text?: string }
    distance?: { text?: string }
  }
}

type RoutesApiResponse = { routes?: RoutesApiRoute[] }

async function computeRouteWithDemoKey(
  apiKey: string,
  origin: Point,
  destination: Point,
  signal: AbortSignal,
): Promise<RoutesApiRoute> {
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'routes.duration',
        'routes.distanceMeters',
        'routes.polyline.encodedPolyline',
        'routes.localizedValues.duration',
        'routes.localizedValues.distance',
      ].join(','),
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
      destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      languageCode: 'ru-RU',
      units: 'METRIC',
    }),
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Routes API ${response.status}: ${details || response.statusText}`)
  }

  const data = (await response.json()) as RoutesApiResponse
  const route = data.routes?.[0]
  if (!route) throw new Error('Routes API returned no routes.')
  return route
}

function decodePolyline(encoded: string): GoogleCoordinate[] {
  const points: GoogleCoordinate[] = []
  let index = 0
  let latitude = 0
  let longitude = 0

  while (index < encoded.length) {
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    latitude += (result & 1) ? ~(result >> 1) : result >> 1

    result = 0
    shift = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    longitude += (result & 1) ? ~(result >> 1) : result >> 1

    points.push({ lat: latitude / 1e5, lng: longitude / 1e5 })
  }

  return points
}

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps]')
    const script = existing ?? document.createElement('script')

    const finish = () => {
      if (!window.google?.maps) {
        reject(new Error('Google Maps API did not load.'))
        return
      }
      resolve(window.google)
    }

    if (existing) {
      if (window.google?.maps) finish()
      else existing.addEventListener('load', finish, { once: true })
      return
    }

    script.dataset.googleMaps = 'true'
    script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(apiKey) + '&v=weekly&libraries=maps,marker'
    script.async = true
    script.onload = finish
    script.onerror = () => reject(new Error('Unable to load Google Maps API.'))
    document.head.appendChild(script)
  })

  return apiPromise
}

function createMarkerContent(label: string, variant: 'origin' | 'destination') {
  const element = document.createElement('div')
  element.className = 'map-marker map-marker-' + variant
  element.textContent = label
  return element
}

export function MapPicker({ selection, origin, destination, onSelect, onRouteUpdate }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<GoogleMapHandle | null>(null)
  const markersRef = useRef<GoogleMarkerHandle[]>([])
  const routePolylinesRef = useRef<GooglePolylineHandle[]>([])
  const onSelectRef = useRef(onSelect)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing-key' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  onSelectRef.current = onSelect

  const clearRoute = () => {
    for (const polyline of routePolylinesRef.current) polyline.setMap(null)
    routePolylinesRef.current = []
  }

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      setStatus('missing-key')
      return
    }

    let cancelled = false
    let clickListener: { remove?(): void } | undefined

    loadGoogleMaps(apiKey)
      .then((googleMaps) => {
        const Map = googleMaps.maps.Map
        const AdvancedMarkerElement = googleMaps.maps.marker.AdvancedMarkerElement

        if (cancelled || !containerRef.current) return

        const map = new Map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 10,
          mapId: 'DEMO_MAP_ID',
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
        })

        clickListener = map.addListener('click', (event) => {
          if (!event.latLng) return
          onSelectRef.current({
            latitude: event.latLng.lat(),
            longitude: event.latLng.lng(),
          })
        })

        mapRef.current = map
        setStatus('ready')

      })
      .catch((error: unknown) => {
        console.error('Google Maps initialization failed', error)
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error))
          setStatus('error')
        }
      })

    return () => {
      cancelled = true
      clickListener?.remove?.()
      for (const marker of markersRef.current) marker.map = null
      markersRef.current = []
      mapRef.current = null
      clearRoute()
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || status !== 'ready' || !window.google?.maps) return

    const googleMaps = window.google
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!googleMaps || !apiKey) return

    clearRoute()
    if (!origin || !destination) {
      onRouteUpdate(null, false, null)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    onRouteUpdate(null, true, null)
    computeRouteWithDemoKey(apiKey, origin, destination, controller.signal).then((route) => {
      if (cancelled) return
      const encodedPolyline = route.polyline?.encodedPolyline
      if (!encodedPolyline) {
        onRouteUpdate(null, false, 'Маршрут между точками не найден.')
        return
      }
      routePolylinesRef.current = [new googleMaps.maps.Polyline({
        map,
        path: decodePolyline(encodedPolyline),
        geodesic: true,
        strokeColor: '#d8664e',
        strokeOpacity: 0.9,
        strokeWeight: 5,
      })]
      const duration = route.localizedValues?.duration?.text ?? formatDuration(route.duration)
      const distance = route.localizedValues?.distance?.text
        ?? (route.distanceMeters ? formatDistance(route.distanceMeters) : null)
      onRouteUpdate({ duration, distance }, false, null)
    }).catch((error: unknown) => {
      if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return
      console.error('Google driving route calculation failed', error)
      onRouteUpdate(null, false, error instanceof Error
        ? `Не удалось рассчитать маршрут: ${error.message}`
        : 'Не удалось рассчитать маршрут через Google Routes API.')
    })

    return () => {
      cancelled = true
      controller.abort()
      clearRoute()
    }
  }, [origin, destination, status])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.google?.maps) return

    for (const marker of markersRef.current) marker.map = null
    markersRef.current = []

    const AdvancedMarkerElement = window.google.maps.marker.AdvancedMarkerElement
    const points: Array<[Point, string, 'origin' | 'destination']> = []
    if (origin) points.push([origin, '1', 'origin'])
    if (destination) points.push([destination, '2', 'destination'])

    for (const [point, label, variant] of points) {
      const marker = new AdvancedMarkerElement({
        map,
        position: { lat: point.latitude, lng: point.longitude },
        title: variant === 'origin' ? 'Point 1' : 'Point 2',
        anchorLeft: '-50%',
        anchorTop: '-100%',
        content: createMarkerContent(label, variant),
      }) as GoogleMarkerHandle
      markersRef.current.push(marker)
    }
  }, [origin, destination, status])

  const statusMessage = {
    loading: 'Loading Google Maps…',
    'missing-key': 'Add VITE_GOOGLE_MAPS_API_KEY to frontend/.env to load the map.',
    error: errorMessage ? 'Google Maps error: ' + errorMessage : 'Google Maps could not be loaded. Check the Demo Key and referrer settings.',
    ready: 'Click the map to place point ' + (selection === 'origin' ? '1' : '2'),
  }[status]

  return (
    <div className="map-picker" aria-label="Google map point picker">
      <div ref={containerRef} className="map-canvas" />
      <div className={'map-message map-message-' + status} role="status">{statusMessage}</div>
    </div>
  )
}

function formatDuration(duration?: string) {
  if (!duration) return 'Время неизвестно'
  const totalMinutes = Math.round(Number.parseFloat(duration) / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours === 0 ? `${minutes} мин` : `${hours} ч ${minutes} мин`
}

function formatDistance(distanceMeters: number) {
  return distanceMeters >= 1000
    ? `${(distanceMeters / 1000).toFixed(1)} км`
    : `${Math.round(distanceMeters)} м`
}
