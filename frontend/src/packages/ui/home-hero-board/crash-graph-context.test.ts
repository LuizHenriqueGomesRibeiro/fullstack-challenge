import { describe, expect, it } from 'bun:test';

import {
  buildCrashCurvePlot,
} from './crash-graph-context';

describe('crash graph curve generation', () => {
  it('builds an exponential sampled path instead of a cubic bezier', () => {
    const plot = buildCrashCurvePlot(0.62, 248, 'running');

    expect(plot.curvePath.startsWith('M ')).toBe(true);
    expect(plot.curvePath.includes(' C ')).toBe(false);
    expect(plot.curvePath.split(' L ').length).toBeGreaterThan(3);
    expect(plot.endY).toBeLessThan(plot.startY);
    expect(plot.markerY).toBe(plot.endY);
  });
});
