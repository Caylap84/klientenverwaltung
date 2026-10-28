import { beforeEach, describe, expect, it } from 'vitest'
import { db, createClient } from '../../storage/repository'
import { addLogEntry, removeLogEntry, sortLogNewestFirst, updateLogEntry } from './logFields'

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())) })

const e = (id: string, date = '2026-01-01', text = '') => ({ id, date, text })

describe('logFields', () => {
  it('fügt hinzu, ändert und löscht', async () => {
    const c = await createClient()
    await addLogEntry(c, e('a'))
    await addLogEntry(c, e('b'))
    await updateLogEntry(c, 'a', { text: 'x' })
    expect((await db.clients.get(c))!.log).toEqual([e('a', '2026-01-01', 'x'), e('b')])
    await removeLogEntry(c, 'a')
    expect((await db.clients.get(c))!.log).toEqual([e('b')])
  })

  it('zwei gleichzeitige Änderungen an verschiedenen Einträgen überschreiben sich nicht', async () => {
    const c = await createClient({ log: [e('a'), e('b')] })
    await Promise.all([
      updateLogEntry(c, 'a', { text: 'A' }),
      updateLogEntry(c, 'b', { date: '2026-02-02' }),
      addLogEntry(c, e('c')),
    ])
    const log = (await db.clients.get(c))!.log
    expect(log.find((x) => x.id === 'a')!.text).toBe('A')
    expect(log.find((x) => x.id === 'b')!.date).toBe('2026-02-02')
    expect(log.map((x) => x.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('ignoriert unbekannte Einträge und schreibt nichts', async () => {
    const c = await createClient({ log: [e('a')] })
    const before = (await db.clients.get(c))!.updatedAt
    await updateLogEntry(c, 'zz', { text: 'x' })
    await removeLogEntry(c, 'zz')
    expect((await db.clients.get(c))!.updatedAt).toBe(before)
  })

  it('sortiert neueste zuerst, bei gleichem Datum später eingefügte zuerst', () => {
    const log = [e('a', '2026-01-02'), e('b', '2026-03-01'), e('c', '2026-01-02')]
    expect(sortLogNewestFirst(log).map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })

  it('Einträge ohne Datum stehen unten', () => {
    const log = [e('leer', ''), e('a', '2026-01-02'), e('b', '2026-03-01'), e('leer2', '')]
    expect(sortLogNewestFirst(log).map((x) => x.id)).toEqual(['b', 'a', 'leer2', 'leer'])
  })
})
