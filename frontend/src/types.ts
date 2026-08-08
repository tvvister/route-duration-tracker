export type Point = {
  latitude: number
  longitude: number
}

export type RouteDraft = {
  origin: Point | null
  destination: Point | null
}
