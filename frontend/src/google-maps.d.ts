export {}

declare global {
  type GoogleCoordinate = { lat: number; lng: number }

  interface GoogleMapClickEvent {
    latLng?: { lat(): number; lng(): number }
  }

  interface GoogleMapHandle {
    addListener(eventName: string, handler: (event: GoogleMapClickEvent) => void): { remove?(): void }
  }

  interface GooglePolylineHandle {
    setMap(map: GoogleMapHandle | null): void
  }

  interface GoogleMarkerHandle {
    map: GoogleMapHandle | null
  }

  interface GoogleRouteHandle {
    durationMillis?: number
    localizedValues?: { duration?: string; distance?: string }
    createPolylines(options?: Record<string, unknown>): GooglePolylineHandle[]
  }

  interface GoogleRoutesLibrary {
    Route: {
      computeRoutes(request: Record<string, unknown>): Promise<{ routes?: GoogleRouteHandle[] }>
    }
  }

  interface GoogleMapsApi {
    maps: {
      Map: new (container: HTMLElement, options: Record<string, unknown>) => GoogleMapHandle
      Polyline: new (options: Record<string, unknown>) => GooglePolylineHandle
      marker: {
        AdvancedMarkerElement: new (options: Record<string, unknown>) => GoogleMarkerHandle
      }
    }
  }

  interface Window {
    google?: GoogleMapsApi
  }
}
