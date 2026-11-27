import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_INVALIDATIONS, matchInvalidation } from '../lib/api/resource.ts';

test('SSE event maps to required resources', () => {
  assert.deepEqual(EVENT_INVALIDATIONS['plan.decided'], [
    '/decisions',
    '/plans',
    '/site/status',
    '/site/bottlenecks',
    '/receiving',
    '/audit',
    '/notifications',
  ]);
  assert.equal(matchInvalidation(['/plans'], '/plans/current/instructions'), true);
  assert.equal(matchInvalidation(['/plans'], '/receiving'), false);
});

test('SSE dashboard events invalidate executive and role dashboard endpoints', () => {
  assert.ok(EVENT_INVALIDATIONS['rt-arrival.created'].includes('/dashboard/executive'));
  assert.ok(EVENT_INVALIDATIONS['rt-arrival.updated'].includes('/supply/rt-arrivals'));
  assert.ok(EVENT_INVALIDATIONS['transfer.created'].includes('/trace/transfers'));
  assert.ok(EVENT_INVALIDATIONS['downtime-event.created'].includes('/downtime-events'));
  assert.ok(EVENT_INVALIDATIONS['po.created'].includes('/pos'));
  assert.ok(EVENT_INVALIDATIONS['schedule.generated'].includes('/schedules/latest'));
  assert.ok(EVENT_INVALIDATIONS['schedule.generated'].includes('/dashboard/executive'));
  assert.ok(EVENT_INVALIDATIONS['cost-item.created'].includes('/costs'));
});
