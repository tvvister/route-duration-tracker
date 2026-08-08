import { useEffect, useRef, useState } from 'react'
import type { Point } from '../types'

type MapPickerProps = {
  selection: 'origin' | 'destination'
  origin: Point | null
  destination: Point | null
  onSelect: (point: Point) => void
}

const DEFAULT_CENTER: YandexCoordinate = [37.61842, 55.75124]
let apiPromise: Promise<YandexMaps3> | null = null

function loadYandexMaps(apiKey: string): Promise<YandexMaps3> {
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-yandex-maps]')
    const script = existing ?? document.createElement('script')
    const finish = () => {
      if (!window.ymaps3) {
        reject(new Error('Yandex Maps API did not expose ymaps3.'))
        return
      }
      window.ymaps3.ready.then(() => resolve(window.ymaps3!)).catch(reject)
    }
    if (existing) {
      finish()
      return
    }
    script.dataset.yandexMaps = 'true'
    script.src = 'https://api-maps.yandex.ru/v3/?apikey=' + encodeURIComponent(apiKey) + '&lang=en_US'
    script.async = true
    script.onload = finish
    script.onerror = () => reject(new Error('Unable to load Yandex Maps API.'))
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
  const mapRef = useRef<YandexMapEntity | null>(null)
  const markersRef = useRef<YandexMapEntity[]>([])
  const onSelectRef = useRef(onSelect)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing-key' | 'error'>('loading')

  onSelectRef.current = onSelect

  useEffect(() => {
    const apiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY
    if (!apiKey) {
      setStatus('missing-key')
      return
    }
    let cancelled = false
    loadYandexMaps(apiKey)
      .then((ymaps3) => {
        if (cancelled || !containerRef.current) return
        const map = new ymaps3.YMap(containerRef.current, {
          location: { center: DEFAULT_CENTER, zoom: 10 },
          behaviors: ['drag', 'scrollZoom', 'pinchZoom', 'dblClick'],
        })
        map.addChild(new ymaps3.YMapDefaultSchemeLayer())
        map.addChild(new ymaps3.YMapDefaultFeaturesLayer({ zIndex: 1800 }))
        map.addChild(new ymaps3.YMapListener({
          layer: 'any',
          onClick: (_object, event) => {
            if (!event.coordinates) return
            const [longitude, latitude] = event.coordinates
            onSelectRef.current({ latitude, longitude })
          },
        }))
        mapRef.current = map
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
      mapRef.current?.destroy?.()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !window.ymaps3) return
    for (const marker of markersRef.current) map.removeChild(marker)
    markersRef.current = []
    const points: Array<[Point, string, 'origin' | 'destination']> = []
    if (origin) points.push([origin, '1', 'origin'])
    if (destination) points.push([destination, '2', 'destination'])
    for (const [point, label, variant] of points) {
      const marker = new window.ymaps3.YMapMarker(
        { coordinates: [point.longitude, point.latitude], source: 'route-points' },
        createMarkerContent(label, variant),
      )
      map.addChild(marker)
      markersRef.current.push(marker)
    }
  }, [origin, destination, status])

  const statusMessage = {
    loading: 'Loading Yandex Maps…',
    'missing-key': 'Add VITE_YANDEX_MAPS_API_KEY to frontend/.env to load the map.',
    error: 'Yandex Maps could not be loaded. Check the API key and allowed referrers.',
    ready: 'Click the map to place point ' + (selection === 'origin' ? '1' : '2'),
  }[status]

  return (
    <div className="map-picker" aria-label="Yandex map point picker">
      <div ref={containerRef} className="map-canvas" />
      <div className={'map-message map-message-' + status} role="status">{statusMessage}</div>
    </div>
  )
}
