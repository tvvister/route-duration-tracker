export type DurationMeasurement = {
  measuredAt: string
  durationSeconds: number
  distanceMeters: number | null
}

type DurationChartProps = {
  measurements: DurationMeasurement[]
}

const WIDTH = 820
const HEIGHT = 340
const MARGIN = { top: 24, right: 24, bottom: 62, left: 72 }
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom

const formatDuration = (seconds: number) => {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours} ч ${remainder} мин` : `${hours} ч`
}

const formatDate = (timestamp: number) => new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
}).format(timestamp)

const formatTime = (timestamp: number) => new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
}).format(timestamp)

const tickValues = (minimum: number, maximum: number, count: number) => (
  Array.from({ length: count }, (_, index) => minimum + ((maximum - minimum) * index) / (count - 1))
)

export function DurationChart({ measurements }: DurationChartProps) {
  const points = measurements
    .map((measurement) => ({
      ...measurement,
      timestamp: new Date(measurement.measuredAt).getTime(),
    }))
    .filter((measurement) => Number.isFinite(measurement.timestamp) && Number.isFinite(measurement.durationSeconds))
    .sort((left, right) => left.timestamp - right.timestamp)

  if (!points.length) {
    return (
      <section className="analytics-card" aria-labelledby="duration-history-title">
        <div className="analytics-heading">
          <div>
            <p className="eyebrow">АНАЛИТИКА</p>
            <h2 id="duration-history-title">История длительности</h2>
          </div>
        </div>
        <p className="analytics-empty">
          Замеров пока нет. Первый появится после запуска worker или в начале следующего часа.
        </p>
      </section>
    )
  }

  const durations = points.map((point) => point.durationSeconds)
  const rawMinimum = Math.min(...durations)
  const rawMaximum = Math.max(...durations)
  const durationPadding = rawMinimum === rawMaximum
    ? Math.max(60, rawMinimum * 0.08)
    : Math.max(30, (rawMaximum - rawMinimum) * 0.15)
  const minimumDuration = Math.max(0, rawMinimum - durationPadding)
  const maximumDuration = rawMaximum + durationPadding

  const firstTimestamp = points[0].timestamp
  const lastTimestamp = points[points.length - 1].timestamp
  const timePadding = firstTimestamp === lastTimestamp ? 30 * 60 * 1000 : 0
  const minimumTimestamp = firstTimestamp - timePadding
  const maximumTimestamp = lastTimestamp + timePadding

  const x = (timestamp: number) => MARGIN.left
    + ((timestamp - minimumTimestamp) / (maximumTimestamp - minimumTimestamp)) * PLOT_WIDTH
  const y = (duration: number) => MARGIN.top
    + (1 - ((duration - minimumDuration) / (maximumDuration - minimumDuration))) * PLOT_HEIGHT

  const linePath = points.map((point, index) => (
    `${index === 0 ? 'M' : 'L'} ${x(point.timestamp).toFixed(2)} ${y(point.durationSeconds).toFixed(2)}`
  )).join(' ')
  const areaPath = `${linePath} L ${x(lastTimestamp).toFixed(2)} ${(MARGIN.top + PLOT_HEIGHT).toFixed(2)} L ${x(firstTimestamp).toFixed(2)} ${(MARGIN.top + PLOT_HEIGHT).toFixed(2)} Z`
  const yTicks = tickValues(minimumDuration, maximumDuration, 5)
  const xTicks = tickValues(minimumTimestamp, maximumTimestamp, Math.min(5, Math.max(2, points.length)))
  const averageDuration = durations.reduce((total, duration) => total + duration, 0) / durations.length
  const latest = points[points.length - 1]

  return (
    <section className="analytics-card" aria-labelledby="duration-history-title">
      <div className="analytics-heading">
        <div>
          <p className="eyebrow">АНАЛИТИКА</p>
          <h2 id="duration-history-title">История длительности</h2>
        </div>
        <span className="measurement-count">{points.length} замеров</span>
      </div>

      <div className="chart-stats" aria-label="Сводка длительности">
        <div><span>Последний</span><strong>{formatDuration(latest.durationSeconds)}</strong></div>
        <div><span>Минимум</span><strong>{formatDuration(rawMinimum)}</strong></div>
        <div><span>Среднее</span><strong>{formatDuration(averageDuration)}</strong></div>
        <div><span>Максимум</span><strong>{formatDuration(rawMaximum)}</strong></div>
      </div>

      <div className="duration-chart-scroll">
        <svg
          className="duration-chart"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-labelledby="duration-chart-title duration-chart-description"
        >
          <title id="duration-chart-title">График длительности маршрута</title>
          <desc id="duration-chart-description">
            По горизонтальной оси показано время замера, по вертикальной — длительность маршрута.
          </desc>
          <defs>
            <linearGradient id="duration-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d8664e" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#d8664e" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                className="chart-grid-line"
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text className="chart-axis-label" x={MARGIN.left - 12} y={y(tick) + 4} textAnchor="end">
                {formatDuration(tick)}
              </text>
            </g>
          ))}

          {xTicks.map((tick) => (
            <g key={tick}>
              <line
                className="chart-tick-line"
                x1={x(tick)}
                x2={x(tick)}
                y1={MARGIN.top + PLOT_HEIGHT}
                y2={MARGIN.top + PLOT_HEIGHT + 6}
              />
              <text className="chart-axis-label" x={x(tick)} y={MARGIN.top + PLOT_HEIGHT + 24} textAnchor="middle">
                <tspan x={x(tick)}>{formatDate(tick)}</tspan>
                <tspan x={x(tick)} dy="16">{formatTime(tick)}</tspan>
              </text>
            </g>
          ))}

          {points.length > 1 && <path className="chart-area" d={areaPath} />}
          {points.length > 1 && <path className="chart-line" d={linePath} />}
          {points.map((point) => (
            <circle
              className="chart-point"
              key={`${point.measuredAt}-${point.durationSeconds}`}
              cx={x(point.timestamp)}
              cy={y(point.durationSeconds)}
              r={points.length === 1 ? 6 : 4}
            >
              <title>{`${new Date(point.measuredAt).toLocaleString('ru-RU')}: ${formatDuration(point.durationSeconds)}`}</title>
            </circle>
          ))}

          <text className="chart-axis-title" x={18} y={MARGIN.top + PLOT_HEIGHT / 2} textAnchor="middle" transform={`rotate(-90 18 ${MARGIN.top + PLOT_HEIGHT / 2})`}>
            Длительность
          </text>
          <text className="chart-axis-title" x={MARGIN.left + PLOT_WIDTH / 2} y={HEIGHT - 4} textAnchor="middle">
            Момент замера
          </text>
        </svg>
      </div>
    </section>
  )
}
