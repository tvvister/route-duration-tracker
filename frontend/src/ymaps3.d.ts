export {}

declare global {
  type YandexCoordinate = [number, number]
  interface YandexMapEvent { coordinates?: YandexCoordinate }
  interface YandexMapEntity {
    addChild(child: YandexMapEntity): YandexMapEntity
    removeChild(child: YandexMapEntity): YandexMapEntity
    destroy?(): void
  }
  interface YandexMaps3 {
    ready: Promise<void>
    YMap: new (container: HTMLElement, props: { location: { center: YandexCoordinate; zoom: number }; behaviors?: string[] }) => YandexMapEntity
    YMapDefaultSchemeLayer: new () => YandexMapEntity
    YMapDefaultFeaturesLayer: new (props?: { zIndex?: number }) => YandexMapEntity
    YMapMarker: new (props: { coordinates: YandexCoordinate; source?: string }, content: HTMLElement) => YandexMapEntity
    YMapListener: new (props: { layer: string; onClick: (object: unknown, event: YandexMapEvent) => void }) => YandexMapEntity
  }
  interface Window { ymaps3?: YandexMaps3 }
}
