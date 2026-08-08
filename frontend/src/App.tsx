import { useState } from 'react'
import { MapPicker } from './components/MapPicker'
import type { Point, RouteDraft } from './types'

const formatPoint = (point: Point | null) => {
  if (!point) return 'Not selected'
  return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`
}

export function App() {
  const [draft, setDraft] = useState<RouteDraft>({ origin: null, destination: null })
  const [selection, setSelection] = useState<'origin' | 'destination'>('origin')
  const [routeLink, setRouteLink] = useState<string | null>(null)

  const choosePoint = (point: Point) => {
    setDraft((current) => ({ ...current, [selection]: point }))
    if (selection === 'origin') setSelection('destination')
  }

  const createRoute = () => {
    if (!draft.origin || !draft.destination) return
    const params = new URLSearchParams({
      from: `${draft.origin.latitude},${draft.origin.longitude}`,
      to: `${draft.destination.latitude},${draft.destination.longitude}`,
    })
    setRouteLink(`${window.location.origin}/routes/demo?${params.toString()}`)
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">ROUTE DURATION TRACKER</p>
        <h1>See how your journey changes over time.</h1>
        <p className="hero-copy">
          Choose two points, create a private-to-the-link route page, and collect an hourly
          duration history.
        </p>
      </section>

      <section className="workspace" aria-label="Create a route">
        <div className="map-card">
          <div className="map-toolbar">
            <span className="map-label">Map picker</span>
            <span className="map-status">Yandex Maps</span>
          </div>
          <MapPicker selection={selection} origin={draft.origin} destination={draft.destination} onSelect={choosePoint} />
        </div>

        <aside className="route-panel">
          <div>
            <p className="eyebrow">NEW ROUTE</p>
            <h2>Pick your two points</h2>
          </div>

          <div className="point-list">
            <button
              className={`point-row ${selection === 'origin' ? 'selected' : ''}`}
              type="button"
              onClick={() => setSelection('origin')}
            >
              <span className="point-number">1</span>
              <span>
                <strong>Point 1</strong>
                <small>{formatPoint(draft.origin)}</small>
              </span>
            </button>
            <button
              className={`point-row ${selection === 'destination' ? 'selected' : ''}`}
              type="button"
              onClick={() => setSelection('destination')}
            >
              <span className="point-number">2</span>
              <span>
                <strong>Point 2</strong>
                <small>{formatPoint(draft.destination)}</small>
              </span>
            </button>
          </div>

          <button className="primary-button" type="button" onClick={createRoute} disabled={!draft.origin || !draft.destination}>
            Generate route link
          </button>

          {routeLink && (
            <div className="share-box" role="status">
              <span>Your route link</span>
              <code>{routeLink}</code>
            </div>
          )}
        </aside>
      </section>
    </main>
  )
}
