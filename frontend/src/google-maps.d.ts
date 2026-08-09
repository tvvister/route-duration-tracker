export {}

declare global {
  type GoogleCoordinate = { lat: number; lng: number }

  interface GoogleMapClickEvent {
    latLng?: { lat(): number; lng(): number }
  }

  interface GoogleMapHandle {
    addListener(eventName: string, handler: (event: GoogleMapClickEvent) => void): { remove?(): void }
  }

  interface GoogleMarkerHandle {
    map: GoogleMapHandle | null
  }

  interface GoogleMapsApi {
    maps: {
      Map: new (container: HTMLElement, options: Record<string, unknown>) => GoogleMapHandle
      marker: {
        AdvancedMarkerElement: new (options: Record<string, unknown>) => GoogleMarkerHandle
      }
    }
  }

  interface Window {
    google?: GoogleMapsApi
  }
}
