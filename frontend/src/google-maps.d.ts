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
      importLibrary(name: string): Promise<any>
    }
  }

  interface Window {
    google?: GoogleMapsApi
  }
}
