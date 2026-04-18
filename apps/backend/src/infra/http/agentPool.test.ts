import { describe, it, expect } from 'vitest';
import { createAgentPool } from './agentPool.js';
import { Agent } from 'undici';

describe('createAgentPool', () => {
  it('returns an undici Agent with defaults', () => {
    const a = createAgentPool();
    expect(a).toBeInstanceOf(Agent);
    void a.close();
  });

  it('accepts custom options', () => {
    const a = createAgentPool({ connections: 8, pipelining: 2, keepAliveTimeout: 1000 });
    expect(a).toBeInstanceOf(Agent);
    void a.close();
  });
});
