export type ProgressChartPoint = {
  x: number
  y: number
  elapsedMs: number
}

export type ProgressScrubSample = ProgressChartPoint

export function plotXFromLocalX(localX: number, layoutWidth: number, plotLeft: number, chartWidth: number): number {
  if (layoutWidth <= 0) return plotLeft
  const plotWidth = Math.max(1, chartWidth - plotLeft)
  const ratio = Math.min(1, Math.max(0, localX / layoutWidth))
  return plotLeft + ratio * plotWidth
}

/** Snap scrub to the nearest recorded run vertex (no interpolation along segments). */
export function nearestProgressVertexAtPlotX(
  points: ProgressChartPoint[],
  plotX: number,
): ProgressScrubSample | null {
  if (!points.length) return null
  if (points.length === 1) return points[0]!

  const first = points[0]!
  const last = points[points.length - 1]!

  if (plotX <= first.x) return first
  if (plotX >= last.x) return last

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    if (plotX < a.x || plotX > b.x) continue
    const midpoint = (a.x + b.x) / 2
    return plotX < midpoint ? a : b
  }

  return last
}

/** @deprecated Use nearestProgressVertexAtPlotX — kept for existing call sites. */
export function sampleProgressAtPlotX(points: ProgressChartPoint[], plotX: number): ProgressScrubSample | null {
  return nearestProgressVertexAtPlotX(points, plotX)
}
