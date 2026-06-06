import { describe, expect, it } from 'bun:test';

import {
  buildCrashCurvePlot,
  buildXAxisTicks,
  buildYAxisTicks,
  GRAPH_WIDTH,
  PLOT,
  plotWidth,
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
    const normal = buildCrashCurvePlot(1, 2000, 'running');
    const extended = buildCrashCurvePlot(2.5, 2000, 'running');

    expect(normal.endX).toBeGreaterThanOrEqual(PLOT.left);
    expect(extended.endX).toBeLessThanOrEqual(GRAPH_WIDTH - PLOT.right);
    expect(extended.endY).toBeGreaterThan(PLOT.top);
  });

  it('keeps graph progress moving past 1', () => {
    expect(calculateGraphProgress(120_000)).toBeGreaterThan(1);
    expect(resolveCrashGraphProgress(2.3, 120_000, 'running')).toBeGreaterThan(1);
  });

  it('does not rewind the graph when the round crashes', () => {
    expect(freezeCrashGraphProgress(2.1, 112)).toBe(2.1);
  });

  it('advances the marker height smoothly as progress grows', () => {
    const early = buildCrashCurvePlot(0.48, 2000, 'running');
    const later = buildCrashCurvePlot(1.18, 2000, 'running');

    expect(early.endY).toBeGreaterThan(PLOT.top + 120);
    expect(later.endY).toBeLessThan(early.endY);
  });

  it('places mid-range multipliers past the halfway point in time', () => {
    const plot = buildCrashCurvePlot(2.2, 2000, 'running');

    expect(plot.endX).toBeGreaterThan(PLOT.left + plotWidth * 0.5);
  });

  it('expands the y axis more smoothly than fixed 10x steps', () => {
    const compact = buildYAxisTicks(1500, 196);
    const roomy = buildYAxisTicks(1500, 336);

    expect(compact.map((tick) => tick.label)).toEqual([
      '5.00x',
      '10.00x',
      '15.00x',
    ]);
    expect(roomy.map((tick) => tick.label)).toEqual([
      '2.50x',
      '5.00x',
      '7.50x',
      '10.00x',
      '12.50x',
      '15.00x',
    ]);
  });

  it('caps the y axis at 20x', () => {
    const ticks = buildYAxisTicks(2000, 336);

    expect(ticks.map((tick) => tick.label).at(-1)).toBe('20.00x');
  });

  it('densifies the tick grid when the graph has more vertical room', () => {
    const compact = buildYAxisTicks(1000, 196);
    const roomy = buildYAxisTicks(1000, 336);

    expect(compact.map((tick) => tick.label)).toEqual([
      '2.50x',
      '5.00x',
      '7.50x',
      '10.00x',
    ]);
    expect(roomy.map((tick) => tick.label)).toEqual([
      '2.00x',
      '4.00x',
      '6.00x',
      '8.00x',
      '10.00x',
    ]);
  });

  it('renders the x axis as elapsed time', () => {
    const compact = buildXAxisTicks(3.75, 420);
    const roomy = buildXAxisTicks(3.75, 760);

    expect(compact.map((tick) => tick.label)).toEqual([
      '0s',
      '1s',
      '2s',
      '3s',
      '3.75s',
    ]);
    expect(roomy.map((tick) => tick.label)).toEqual([
      '0s',
      '0.5s',
      '1s',
      '1.5s',
      '2s',
      '2.5s',
      '3s',
      '3.5s',
      '3.75s',
    ]);
  });
});
