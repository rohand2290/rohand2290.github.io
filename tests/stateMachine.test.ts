import { describe, expect, it } from 'vitest';
import { StateMachine } from '../src/player/stateMachine';
import { screenToGrid } from '../src/player/controller';

describe('StateMachine', () => {
  it('walks, stops, and reads', () => {
    const sm = new StateMachine();
    expect(sm.state).toBe('idle');
    expect(sm.send('move')).toBe(true);
    expect(sm.state).toBe('walking');
    expect(sm.send('stop')).toBe(true);
    expect(sm.state).toBe('idle');
    expect(sm.send('read')).toBe(true);
    expect(sm.state).toBe('reading');
    expect(sm.send('closeRead')).toBe(true);
    expect(sm.state).toBe('idle');
  });

  it('crosses bridges: on, pause, off', () => {
    const sm = new StateMachine();
    sm.send('move');
    expect(sm.send('enterBridge')).toBe(true);
    expect(sm.state).toBe('onBridge');
    // Releasing every key pauses mid-bridge: still on the bridge.
    expect(sm.send('stop')).toBe(true);
    expect(sm.state).toBe('onBridge');
    expect(sm.send('exitBridge')).toBe(true);
    expect(sm.state).toBe('walking');
  });

  it('rejects transitions that make no sense', () => {
    const sm = new StateMachine();
    sm.send('move');
    sm.send('enterBridge');
    expect(sm.send('read')).toBe(false); // no reading signs mid-bridge
    expect(sm.state).toBe('onBridge');
    expect(sm.send('arrive')).toBe(false);
    expect(sm.send('closeRead')).toBe(false);
  });

  it('auto-travel ends by arriving or by any key', () => {
    const sm = new StateMachine();
    expect(sm.send('travel')).toBe(true);
    expect(sm.state).toBe('autoTraveling');
    expect(sm.send('enterBridge')).toBe(true);
    expect(sm.state).toBe('autoTraveling');
    expect(sm.send('arrive')).toBe(true);
    expect(sm.state).toBe('reading');
    sm.send('travel');
    expect(sm.send('interrupt')).toBe(true);
    expect(sm.state).toBe('idle');
  });

  it('reports changes and time in state', () => {
    const sm = new StateMachine();
    const seen: string[] = [];
    sm.onChange = (to, from) => seen.push(`${from}->${to}`);
    sm.send('move');
    sm.tick(0.5);
    expect(sm.time).toBeCloseTo(0.5);
    sm.send('move'); // same state: no change reported, timer keeps running
    expect(sm.time).toBeCloseTo(0.5);
    sm.send('stop');
    expect(seen).toEqual(['idle->walking', 'walking->idle']);
  });
});

describe('screenToGrid', () => {
  it('maps screen directions onto the isometric grid', () => {
    expect(screenToGrid(0, 1)).toEqual([-1, -1]); // up
    expect(screenToGrid(0, -1)).toEqual([1, 1]); // down
    expect(screenToGrid(1, 0)).toEqual([1, -1]); // right
    expect(screenToGrid(-1, 0)).toEqual([-1, 1]); // left
    expect(screenToGrid(1, 1)).toEqual([0, -1]); // up-right runs along a grid axis
    expect(screenToGrid(0, 0)).toEqual([0, 0]);
  });
});
