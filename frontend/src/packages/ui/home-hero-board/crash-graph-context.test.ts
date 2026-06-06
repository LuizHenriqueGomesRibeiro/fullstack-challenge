import { describe, expect, it } from 'bun:test';

import {
  buildCrashCurvePlot,
  buildYAxisTicks,
  GRAPH_WIDTH,
  PLOT,
  resolveCrashGraphProgress,
} from './crash-graph-context';
import { calculateGraphProgress } from '../../core/hooks/roundQuery';

describe('crash graph curve generation', () => {
  it('builds an exponential sampled path instead of a cubic bezier', () => {
    const plot = buildCrashCurvePlot(0.62, 248, 'running');

    expect(plot.curvePath.startsWith('M ')).toBe(true);
    expect(plot.curvePath.includes(' C ')).toBe(false);
    expect(plot.curvePath.split(' L ').length).toBeGreaterThan(3);
    expect(plot.endY).toBeLessThan(plot.startY);
    expect(plot.markerY).toBe(plot.endY);
  });

  it('starts gently and accelerates toward the end of the curve', () => {
    const plot = buildCrashCurvePlot(0.62, 248, 'running');
    const points = plot.curvePath.match(/(?:M|L)\s+[-0-9.]+\s+[-0-9.]+/g) ?? [];
    const parseY = (entry: string) => Number(entry.split(/\s+/)[2]);

    const firstStep = parseY(points[1]!) - parseY(points[0]!);
    const lateStep = parseY(points.at(-1)!) - parseY(points.at(-2)!);

    expect(Math.abs(lateStep)).toBeGreaterThan(Math.abs(firstStep));
  });

  it('keeps the visual path within the chart bounds', () => {
    const normal = buildCrashCurvePlot(1, 248, 'running');
    const extended = buildCrashCurvePlot(2.5, 248, 'running');

    expect(extended.endX).toBeGreaterThan(normal.endX);
    expect(extended.endX).toBeLessThan(GRAPH_WIDTH - PLOT.right);
    expect(extended.endY).toBeLessThan(normal.endY);
    expect(extended.endY).toBeGreaterThan(PLOT.top);
  });

  it('keeps graph progress moving past 1', () => {
    expect(calculateGraphProgress(120_000)).toBeGreaterThan(1);
    expect(resolveCrashGraphProgress(2.3, 120_000, 'running')).toBeGreaterThan(1);
  });

  it('raises the y axis ceiling when multipliers grow', () => {
    const ticks = buildYAxisTicks(2000);
    const labels = ticks.map((tick) => tick.label);

    expect(labels).toContain('20x');
    expect(labels[labels.length - 1]).toBe('20x');
  });
});
