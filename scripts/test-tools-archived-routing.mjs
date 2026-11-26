#!/usr/bin/env node
/**
 * Regression tests for archived-session routing in the bridge.
 *
 * Contract:
 * - `session_bridge_find` hides the workspace archive set by default; only an
 *   explicit `includeArchived: true` returns those sessions.
 * - `session_bridge_send` and `session_bridge_resume` refuse an archived target
 *   before looking up a live agent, delivering a message, or resuming anything.
 * - Read/status/archive/unarchive are deliberately untouched.
 *
 * This drives the REAL registered handlers (src/tools.ts) with a stub host, so it
 * covers the actual execute() paths. Runs via Node type stripping: `npm test`.
 */
import assert from 'node:assert/strict'
import { registerBridgeTools } from '../src/tools.ts'

const SEND_ARCHIVED_ERROR = 'session_bridge_send refuses archived session "sb-archived-live". Unarchive it first.'
const RESUME_ARCHIVED_ERROR = 'session_bridge_resume refuses archived session "sb-archived-live". Unarchive it first.'

function assertLossless(value) {
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value, 'tool values must be lossless JSON')
}

function makeAgent(id, createdAt, calls) {
  return {
    id,
    status: 'idle',
    ctx: {},
    session: {
      header: { id, cwd: 'D:/' + id, createdAt },
      snapshotEvents: () => [],
    },
    followup(message) {
      calls.followups.push({ id, message })
    },
    steer(message) {
      calls.steers.push({ id, message })
    },
    cancel() {},
  }
}

/**
 * Four sessions:
 * - sb-active        live, not archived
 * - sb-archived-live live, archived
 * - sb-offline-active offline, not archived
 * - sb-archived-offline offline, archived
 */
function harness() {
  const tools = new Map()
  const calls = { followups: [], steers: [], lookups: [], touches: [], resumes: [], persistenceLists: 0 }
  const archive = ['sb-archived-live', 'sb-archived-offline']
  const agents = new Map([
    ['sb-active', makeAgent('sb-active', 100, calls)],
    ['sb-archived-live', makeAgent('sb-archived-live', 200, calls)],
  ])
  const offline = [
    { header: { id: 'sb-offline-active', cwd: 'D:/sb-offline-active', createdAt: 50 } },
    { header: { id: 'sb-archived-offline', cwd: 'D:/sb-archived-offline', createdAt: 150 } },
  ]
  const ctx = {
    tools: { register: (tool) => { tools.set(tool.name, tool) } },
    agents: {
      get(id) {
        calls.lookups.push(id)
        return agents.get(id)
      },
      list: () => [...agents.values()],
      async resume(options) {
        calls.resumes.push(options)
        throw new Error('agents.resume must not be called for an archived target')
      },
    },
    workspaceRegistry: {
      get archivedSessionIds() { return archive },
      list: () => [],
      get: () => undefined,
      resolveByPath: async () => undefined,
    },
    sessionPersistence: {
      async list() {
        calls.persistenceLists += 1
        return offline
      },
      open: async () => { throw new Error('not used: find resolves no offline titles here') },
    },
    setInterval: () => 0,
    clearInterval: () => {},
    effect: () => {},
  }
  const registry = {
    all: async () => [],
    record() {},
    touch(sessionId, entry) { calls.touches.push({ sessionId, entry }) },
    load: async () => {},
    persist: async () => {},
  }
  const monitor = { dispose() {}, start() {}, stop: () => false, list: () => [] }
  registerBridgeTools({ ctx, registry, monitor })

  const exec = { signal: new AbortController().signal }
  return {
    calls,
    agents,
    runFind: (args) => tools.get('session_bridge_find').execute(args, exec),
    runSend: (args) => tools.get('session_bridge_send').execute(args, exec),
    runResume: (args) => tools.get('session_bridge_resume').execute(args, exec),
  }
}

let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    passed += 1
    console.log('PASS ' + name)
  } catch (error) {
    failed += 1
    console.error('FAIL ' + name)
    console.error('     ' + (error instanceof Error ? error.message : String(error)))
  }
}

await test('find: archived sessions are hidden by default', async () => {
  const h = harness()
  const value = await h.runFind({})
  assert.deepEqual(value.items.map((item) => item.sessionId), ['sb-active', 'sb-offline-active'])
  assert.equal(value.total, 2)
  assert.equal(value.truncated, false)
  assertLossless(value)
})

await test('find: includeArchived=true returns archived sessions', async () => {
  const h = harness()
  const value = await h.runFind({ includeArchived: true })
  assert.deepEqual(
    value.items.map((item) => item.sessionId).sort(),
    ['sb-active', 'sb-archived-live', 'sb-archived-offline', 'sb-offline-active'],
  )
  assert.equal(value.total, 4)
  assert.equal(value.truncated, false)
  assert.equal(value.items.find((item) => item.sessionId === 'sb-archived-live').live, true)
  assert.equal(value.items.find((item) => item.sessionId === 'sb-archived-offline').live, false)
  assertLossless(value)
})

await test('find: only an explicit true opts in (false stays hidden)', async () => {
  const h = harness()
  const value = await h.runFind({ includeArchived: false })
  assert.deepEqual(value.items.map((item) => item.sessionId), ['sb-active', 'sb-offline-active'])
  assert.equal(value.total, 2)
  assertLossless(value)
})

await test('find: total/truncated count the post-filter set, not the raw set', async () => {
  const h = harness()
  const value = await h.runFind({ limit: 1 })
  assert.equal(value.items.length, 1)
  assert.equal(value.items[0].sessionId, 'sb-active')
  assert.equal(value.total, 2, 'the two archived sessions must not inflate total')
  assert.equal(value.truncated, true, 'one returned of two visible is truncated')
  assertLossless(value)
})

await test('send: an archived target is refused before any delivery', async () => {
  const h = harness()
  await assert.rejects(
    () => h.runSend({ sessionId: 'sb-archived-live', message: 'hello' }),
    (error) => {
      assert.ok(error instanceof Error)
      assert.equal(error.message, SEND_ARCHIVED_ERROR)
      return true
    },
  )
  assert.equal(h.calls.followups.length, 0, 'archived target must not receive followup')
  assert.equal(h.calls.steers.length, 0, 'archived target must not receive steer')
  assert.deepEqual(h.calls.lookups, [], 'refusal happens before live-agent lookup')
  assert.deepEqual(h.calls.touches, [], 'refusal happens before registry accounting')
})

await test('send: steer mode is also refused for an archived target', async () => {
  const h = harness()
  await assert.rejects(
    () => h.runSend({ sessionId: 'sb-archived-live', message: 'interrupt', mode: 'steer' }),
    (error) => error instanceof Error && error.message === SEND_ARCHIVED_ERROR,
  )
  assert.equal(h.calls.followups.length, 0)
  assert.equal(h.calls.steers.length, 0)
  assert.deepEqual(h.calls.lookups, [])
})

await test('resume: an archived target is refused before resume/lookup', async () => {
  const h = harness()
  await assert.rejects(
    () => h.runResume({ sessionId: 'sb-archived-live' }),
    (error) => {
      assert.ok(error instanceof Error)
      assert.equal(error.message, RESUME_ARCHIVED_ERROR)
      return true
    },
  )
  assert.deepEqual(h.calls.resumes, [], 'archived target must not be resumed')
  assert.deepEqual(h.calls.lookups, [], 'refusal happens before live-agent lookup')
  assert.equal(h.calls.persistenceLists, 0, 'refusal happens before persistence listing')
})

await test('send: an active target still sends normally', async () => {
  const h = harness()
  const value = await h.runSend({ sessionId: 'sb-active', message: 'hello' })
  assert.equal(value.accepted, true)
  assert.equal(value.sessionId, 'sb-active')
  assert.equal(value.sinceSeq, -1)
  assert.equal(h.calls.followups.length, 1)
  assert.equal(h.calls.followups[0].id, 'sb-active')
  assert.equal(h.calls.followups[0].message.role, 'user')
  assert.deepEqual(h.calls.followups[0].message.content, [{ type: 'text', text: 'hello' }])
  assert.equal(h.calls.steers.length, 0)
  assert.deepEqual(h.calls.lookups, ['sb-active'])
  assert.deepEqual(h.calls.touches.map((entry) => entry.sessionId), ['sb-active'])
  assertLossless(value)
})

console.log('\n' + String(passed) + ' passed, ' + String(failed) + ' failed')
if (failed > 0) process.exitCode = 1
