// Сервер меняет состав старого альбома; проверяем настоящий store, UI и сохранённый кэш.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const executablePath = process.env.CHROME ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const browser = await chromium.launch({ executablePath })
const page = await browser.newPage({ locale: 'ru-RU' })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
let count = 1
let unavailable = false
let catalog
let holdPage = false
let pageEntered, releasePage
const entered = new Promise((resolve) => { pageEntered = resolve })
const gate = new Promise((resolve) => { releasePage = resolve })
const album = { id: 'album', name: 'Growing album', artist: 'Artist' }
const songs = () => Array.from({ length: count }, (_, i) => ({ id: `s${i}`, title: `Track ${i + 1}`, albumId: album.id, duration: 100 }))
await page.route('**/rest/*.view?**', async (route) => {
  if (unavailable) return route.fulfill({ status: 503, body: 'Unavailable' })
  const url = new URL(route.request().url())
  const endpoint = url.pathname.split('/').pop()
  const offset = Number(url.searchParams.get('offset') ?? 0)
  const albums = catalog ?? [album, ...(count > 2 ? [{ id: 'new-album', name: 'New album' }] : [])]
  const body = endpoint === 'getAlbum.view' ? { album: { ...album, song: songs() } }
    : endpoint === 'getAlbumList2.view' ? { albumList2: { album: albums.slice(offset, offset + Number(url.searchParams.get('size'))) } }
    : {}
  if (holdPage && endpoint === 'getAlbumList2.view' && offset === 60) {
    holdPage = false
    pageEntered()
    await gate
  }
  await route.fulfill({ json: { 'subsonic-response': { status: 'ok', ...body } } })
})
const call = (fn) => page.evaluate(async (source) => {
  const { store } = await import('/src/state/store.ts')
  return Function('store', `return (${source})(store)`)(store)
}, fn.toString())
const connect = () => call((store) => store.connect('http://127.0.0.1:4533', 'test', 'demo'))
const open = () => call((store) => store.open({ kind: 'album', album: { id: 'album', name: 'Growing album' } }))
const rows = page.locator('main .song-row')
try {
  await page.goto('http://localhost:1431/')
  await page.locator('button[type=submit]').waitFor()
  await connect()
  await open()
  await page.waitForFunction(() => document.querySelectorAll('main .song-row').length === 1)
  count = 2
  await page.getByRole('button', { name: 'Обновить', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('main .song-row').length === 2)
  console.log('PASS: refresh reveals a new track in an already cached album')
  count = 3
  await call((store) => store.section({ kind: 'home' }))
  await open()
  await page.waitForFunction(() => document.querySelectorAll('main .song-row').length === 3)
  console.log('PASS: reopening an album revalidates its songs')
  await page.waitForTimeout(300)
  await page.reload()
  await page.locator('button[type=submit]').waitFor()
  count = 4
  await connect()
  await open()
  await page.waitForFunction(() => document.querySelectorAll('main .song-row').length === 4)
  console.log('PASS: persisted catalog does not hide tracks after restart')
  await call(async (store) => { store.section({ kind: 'albums' }); await store.moreAlbums() })
  await page.waitForFunction(async () => (await import('/src/state/store.ts')).store.snapshot().albums.length === 2)
  count = 2
  await call((store) => store.refresh())
  assert.deepEqual(await call((store) => store.snapshot().albums.map((a) => a.id)), ['album'])
  console.log('PASS: refresh replaces the album catalog without retaining removed albums')
  await open()
  await page.waitForFunction(() => document.querySelectorAll('main .song-row').length === 2)
  unavailable = true
  await call((store) => store.refresh())
  assert.equal(await rows.count(), 2)
  assert.equal(await call((store) => store.snapshot().albums.length), 1)
  console.log('PASS: server failure preserves cached songs and albums')
  unavailable = false
  await call((store) => store.section({ kind: 'home' }))
  catalog = Array.from({ length: 65 }, (_, i) => ({ id: `a${i}`, name: `Album ${i}` }))
  await call((store) => store.refresh())
  assert.equal(await call((store) => store.snapshot().albums.length), 60)
  holdPage = true
  await call((store) => { void store.moreAlbums() })
  await entered
  catalog.unshift({ id: 'inserted', name: 'A new first album' })
  await call((store) => store.refresh())
  releasePage()
  await page.waitForTimeout(200)
  assert.deepEqual(await call((store) => store.snapshot().albums.map((a) => a.id)), catalog.slice(0, 60).map((a) => a.id))
  await call((store) => Promise.all([store.moreAlbums(), store.moreAlbums()]))
  assert.deepEqual(await call((store) => store.snapshot().albums.map((a) => a.id)), catalog.map((a) => a.id))
  console.log('PASS: a late page cannot mix old offsets into the refreshed catalog; parallel pagination does not duplicate albums')
  catalog.unshift({ id: 'another', name: 'Another first album' })
  await call((store) => store.refresh())
  assert.deepEqual(await call((store) => store.snapshot().albums.map((a) => a.id)), catalog.map((a) => a.id))
  console.log('PASS: refresh revalidates all previously loaded pages')
  assert.deepEqual(errors, [])
} catch (error) {
  console.error(await call((store) => ({ status: store.snapshot().status, view: store.snapshot().view.kind, songs: store.snapshot().songs, error: store.snapshot().error })))
  console.error('UI:', await page.locator('body').innerText(), 'Runtime errors:', errors)
  throw error
} finally { await browser.close() }
