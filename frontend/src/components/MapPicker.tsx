import { useEffect, useRef, useState } from 'react'
import type { Point } from '../types'

type MapPickerProps = {
  selection: 'origin' | 'destination'
  origin: Point | null
  destination: Point | null
  onSelect: (point: Point) => void
}

const DEFAULT_CENTER: GoogleCoordinate = { lat: 55.75124, lng: 37.61842 }
let apiPromise: Promise<GoogleMapsApi> | null = null

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
    script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(apiKey) + '&v=weekly&loading=async'
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

export function MapPicker({ selection, origin, destination, onSelect }: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<GoogleMapHandle | null>(null)
  const markersRef = useRef<GoogleMarkerHandle[]>([])
  const onSelectRef = useRef(onSelect)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing-key' | 'error'>('loading')

  onSelectRef.current = onSelect

  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      setStatus('missing-key')
      return
    }

    let cancelled = false
    let clickListener: { remove?(): void } | undefined

    loadGoogleMaps(apiKey)
      .then(async (googleMaps) => {
        const { Map } = await googleMaps.maps.importLibrary('maps') as {
          Map: new (container: HTMLElement, options: Record<string, unknown>) => GoogleMapHandle
        }
        const { AdvancedMarkerElement } = await googleMaps.maps.importLibrary('marker') as {
          AdvancedMarkerElement: new (options: Record<string, unknown>) => GoogleMarkerHandle
        }

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

        ;(map as GoogleMapHandle & { markerConstructor?: unknown }).markerConstructor = AdvancedMarkerElement
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => {
      cancelled = true
      clickListener?.remove?.()
      for (const marker of markersRef.current) marker.map = null
      markersRef.current = []
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.google?.maps) return

    for (const marker of markersRef.current) marker.map = null
    markersRef.current = []

    window.google.maps.importLibrary('marker').then(({ AdvancedMarkerElement }) => {
      const points: Array<[Point, string, 'origin' | 'destination']> = []
      if (origin) points.push([origin, '1', 'origin'])
      if (destination) points.push([destination, '2', 'destination'])

      for (const [point, label, variant] of points) {
        const marker = new AdvancedMarkerElement({
          map,
          position: { lat: point.latitude, lng: point.longitude },
          title: variant === 'origin' ? 'Point 1' : 'Point 2',
          content: createMarkerContent(label, variant),
        }) as GoogleMarkerHandle
        markersRef.current.push(marker)
      }
    })
  }, [origin, destination, status])

  const statusMessage = {
    loading: 'Loading Google Maps…',
    'missing-key': 'Add VITE_GOOGLE_MAPS_API_KEY to frontend/.env to load the map.',
    error: 'Google Maps could not be loaded. Check the Demo Key and referrer settings.',
    ready: 'Click the map to place point ' + (selection === 'origin' ? '1' : '2'),
  }[status]

  return (
    <div className="map-picker" aria-label="Google map point picker">
      <div ref={containerRef} className="map-canvas" />
      <div className={'map-message map-message-' + status} role="status">{statusMessage}</div>
    </div>
  )
}
