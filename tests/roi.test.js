const { calculateROI } = require('../services/roi');
const pricing = require('../lib/agent-pricing');

describe('calculateROI', () => {
  test('should calculate ROI correctly for L1 layer', () => {
    const reward = pricing.L1 + 1.0;
    const task = { reward, layer: 'L1' };
    const result = calculateROI(task);
    expect(result).toEqual({
      revenue: reward,
      cost: pricing.L1,
      roi: reward - pricing.L1,
      profitable: true
    });
  });

  test('should calculate ROI correctly for L2 layer', () => {
    const reward = pricing.L2 + 0.5;
    const task = { reward, layer: 'L2' };
    const result = calculateROI(task);
    expect(result).toEqual({
      revenue: reward,
      cost: pricing.L2,
      roi: reward - pricing.L2,
      profitable: true
    });
  });

  test('should calculate ROI correctly for L3 layer', () => {
    const reward = pricing.L3 + 2.0;
    const task = { reward, layer: 'L3' };
    const result = calculateROI(task);
    expect(result).toEqual({
      revenue: reward,
      cost: pricing.L3,
      roi: reward - pricing.L3,
      profitable: true
    });
  });

  test('should calculate ROI correctly for brain layer', () => {
    const reward = pricing.brain + 0.15;
    const task = { reward, layer: 'brain' };
    const result = calculateROI(task);
    expect(result).toEqual({
      revenue: reward,
      cost: pricing.brain,
      roi: reward - pricing.brain,
      profitable: true
    });
  });

  test('should return non-profitable if ROI is 0', () => {
    const task = { reward: pricing.L1, layer: 'L1' };
    const result = calculateROI(task);
    expect(result.roi).toBe(0);
    expect(result.profitable).toBe(false);
  });

  test('should return non-profitable if ROI is negative', () => {
    const reward = pricing.L1 - 0.01;
    const task = { reward, layer: 'L1' };
    const result = calculateROI(task);
    expect(result.roi).toBeLessThan(0);
    expect(result.profitable).toBe(false);
  });

  test('should default to L1 cost for unknown layer', () => {
    const task = { reward: 1.0, layer: 'unknown' };
    const result = calculateROI(task);
    expect(result.cost).toBe(pricing.L1);
  });

  test('should handle reward as a string', () => {
    const reward = pricing.L1 + 1.5;
    const task = { reward: reward.toString(), layer: 'L1' };
    const result = calculateROI(task);
    expect(result.revenue).toBe(reward);
    expect(result.roi).toBe(reward - pricing.L1);
  });

  test('should default reward to 0 if missing', () => {
    const task = { layer: 'L1' };
    const result = calculateROI(task);
    expect(result.revenue).toBe(0);
    expect(result.roi).toBe(-pricing.L1);
  });

  test('should default reward to 0 if invalid string', () => {
    const task = { reward: 'invalid', layer: 'L1' };
    const result = calculateROI(task);
    expect(result.revenue).toBe(0);
    expect(result.roi).toBe(-pricing.L1);
  });
});
