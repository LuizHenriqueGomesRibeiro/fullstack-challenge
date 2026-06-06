import { describe, expect, it } from 'bun:test';

import {
  buildCrashCurvePlot,
  buildYAxisTicks,
  floorY,
  GRAPH_WIDTH,
  PLOT,
  resolveCrashGraphProgress,
} from './crash-graph-context';
import { calculateGraphProgress } from '../../core/hooks/roundQuery';
import { freezeCrashGraphProgress } from '../../core/utils/crash-graph';

describe('crash graph curve generation', () => {
  it('builds an exponential sampled path instead of a cubic bezier', () => {
    const plot = buildCrashCurvePlot(0.62, 248, 'running');

    expect(plot.curvePath.startsWith('M ')).toBe(true);
    expect(plot.curvePath.includes(' C ')).toBe(false);
    expect(plot.curvePath.split(' L ').length).toBeGreaterThan(3);
    expect(plot.endY).toBeLessThan(plot.startY);
    expect(plot.markerY).toBe(plot.endY);
  });

  it('starts the running curve at the left edge of the plot', () => {
    const plot = buildCrashCurvePlot(0, 100, 'running');

    expect(plot.endX).toBe(plot.startX);
    expect(plot.markerX).toBe(plot.startX);
  });

  it('moves the marker horizontally at a steady pace', () => {
    const first = buildCrashCurvePlot(0.5, 100, 'running');
    const second = buildCrashCurvePlot(1.5, 100, 'running');
    const third = buildCrashCurvePlot(2.5, 100, 'running');

    const firstStep = second.endX - first.endX;
    const secondStep = third.endX - second.endX;

    expect(secondStep).toBeCloseTo(firstStep, 6);
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
    const normal = buildCrashCurvePlot(1, 112, 'running');
    const extended = buildCrashCurvePlot(1, 500, 'running');

    expect(normal.endX).toBeGreaterThanOrEqual(PLOT.left);
    expect(extended.endX).toBeLessThanOrEqual(GRAPH_WIDTH - PLOT.right);
    expect(extended.endY).toBeLessThan(normal.endY);
    expect(extended.endY).toBeGreaterThan(PLOT.top);
  });

  it('keeps graph progress moving past 1', () => {
    expect(calculateGraphProgress(120_000)).toBeGreaterThan(1);
    expect(resolveCrashGraphProgress(2.3, 120_000, 'running')).toBeGreaterThan(1);
  });

  it('does not rewind the graph when the round crashes', () => {
    expect(freezeCrashGraphProgress(2.1, 112)).toBe(2.1);
  });

  it('anchors the marker height to the current multiplier', () => {
    const early = buildCrashCurvePlot(1.12, 112, 'running');
    const higher = buildCrashCurvePlot(1.12, 500, 'running');

    expect(early.endY).toBeGreaterThan(floorY - 28);
    expect(higher.endY).toBeLessThan(early.endY);
  });

  it('raises the y axis ceiling when multipliers grow', () => {
    const ticks = buildYAxisTicks(2000);
    const labels = ticks.map((tick) => tick.label);

    expect(labels).toContain('20x');
    expect(labels[labels.length - 1]).toBe('20x');
  });

  it('places 5x at the middle of a 10x axis', () => {
    const ticks = buildYAxisTicks(1000);
    const tick = ticks.find((entry) => entry.label === '5x');

    expect(tick?.y).toBeCloseTo((PLOT.top + floorY) / 2, 6);
  });
});
