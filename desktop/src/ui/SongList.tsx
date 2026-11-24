import { useEffect, useMemo, useRef, useState } from 'react'
import type { Song } from '../core/models'
import { isLocalId } from '../core/source'
import { store, useStore } from '../state/store'
import { popupMenu, type MenuEntry } from '../shell'
import { askText, showInformation } from './Dialogs'
import { beginDrag, registerDrop, useDrag, type DragPayload } from './drag'
import { Icon } from './Icon'
import { t } from '../i18n'
import { appVersion } from '../platform'

export function formatTime(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return ''
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

type SortKey = 'title' | 'album' | 'rating' | 'duration' | 'created' | 'artist'
type Sort = { key: SortKey; descending: boolean } | undefined

/** Звёзды оценки прямо в строке: клик по той же звезде снимает оценку. */
function Rating({ song }: { song: Song }) {
  useStore()
  const rating = store.ratingOf(song)
  return (
    <span className="flex items-center" onDoubleClick={(event) => event.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          onClick={(event) => {
            event.stopPropagation()
            void store.setRating([song], rating === value ? 0 : value)
          }}
          className={`grid h-6 w-4 place-items-center ${value <= rating ? 'text-accent-text' : 'text-secondary/40 opacity-0 group-hover:opacity-100'}`}
          aria-label={t('Оценка {n}', { n: value })}
          title={t('Оценка {n}', { n: value })}
        >
          <Icon name={value <= rating ? 'starFilled' : 'star'} size={11} />
        </button>
      ))}
    </span>
  )
}

/** Меню для выделенных треков: всё, что можно с ними сделать, в одном месте — как в Feishin. */
export function songMenu(songs: Song[], options: { onRemove?: () => void; removeLabel?: string; playAll?: () => void } = {}): MenuEntry[] {
  const state = store.snapshot()
  const online = !!state.client && !state.offline
  const playable = songs.filter((song) => store.isPlayable(song))
  const server = songs.filter((song) => !isLocalId(song.id))
  const single = songs.length === 1 ? songs[0] : undefined
  const many = songs.length > 1
  const allStarred = server.length > 0 && server.every((song) => state.starredIds.has(song.id))
  const rating = single ? store.ratingOf(single) : 0
  return [
    single && { text: t('Информация о треке'), action: async () => {
      const data = { ...store.trackDiagnostics(single), version: await appVersion().catch(() => undefined) }
      const source = data.source === 'local' ? t('Локальный файл') : data.source === 'download' ? t('Скачанная копия') : t('Сервер')
      const rows = [
        `${t('Название')}: ${single.title}`, `${t('Исполнитель')}: ${single.artist ?? '—'}`,
        `${t('Источник')}: ${source}`, `${t('Длительность в каталоге')}: ${formatTime(single.duration) || '—'}`,
        ...(data.playerDurationSeconds === undefined ? [] : [`${t('Длительность в плеере')}: ${formatTime(data.playerDurationSeconds)}`]),
        `${t('Формат оригинала')}: ${single.suffix?.toUpperCase() ?? '—'}`,
        `${t('Битрейт оригинала')}: ${single.bitRate ? `${single.bitRate} kbps` : '—'}`,
        `${t('Частота оригинала')}: ${single.samplingRate ? `${single.samplingRate} Hz` : '—'}`,
        `${t('Размер оригинала')}: ${single.size ? `${(single.size / 1048576).toFixed(1)} MB` : '—'}`,
      ]
      showInformation(t('Информация о треке'), rows.join('\n'), JSON.stringify(data, null, 2))
    } },
    online && single && !single.streamUrl && !isLocalId(single.id) && !state.downloading[single.id] && { text: t('Перескачать и перезапустить'), action: () => void store.repairTrack(single) },
    playable.length > 0 && {
      text: many ? t('Играть выбранные ({n})', { n: playable.length }) : t('Играть'),
      action: () => (options.playAll ? options.playAll() : void store.play(playable, 0)),
    },
    playable.length > 0 && { text: t('Сыграть следующим'), action: () => store.playNext(playable) },
    playable.length > 0 && { text: t('В конец очереди'), action: () => store.append(playable) },
    'separator',
    online &&
      server.length > 0 && {
        text: t('Добавить в плейлист'),
        items: [
          {
            text: t('Новый плейлист…'),
            action: () =>
              void askText(t('Новый плейлист'), { label: t('Название'), confirm: t('Создать') }).then(
                (name) => name && void store.createPlaylist(name, server),
              ),
          },
          state.playlists.length > 0 && 'separator',
          ...state.playlists.map((playlist) => ({ text: playlist.name, action: () => void store.addToPlaylist(playlist, server) })),
        ],
      },
    online && single && !isLocalId(single.id) && { text: t('Микс по треку'), action: () => void store.playMix(single) },
    !!single?.albumId && { text: t('Перейти к альбому'), action: () => store.openAlbumOf(single) },
    !!single?.artistId && { text: t('Перейти к исполнителю'), action: () => store.openArtistOf(single) },
    online && single && !isLocalId(single.id) && { text: t('Поделиться ссылкой'), action: () => void store.share(single.id, single.title) },
    'separator',
    online &&
      server.length > 0 && {
        text: allStarred ? t('Убрать из избранного') : t('В избранное'),
        action: () => {
          for (const song of server) if (state.starredIds.has(song.id) === allStarred) void store.toggleStar(song)
        },
      },
    online &&
      server.length > 0 && {
        text: t('Оценка'),
        items: [
          ...[5, 4, 3, 2, 1].map((value) => ({
            text: `${'★'.repeat(value)}${'☆'.repeat(5 - value)}${rating === value ? '  ✓' : ''}`,
            action: () => void store.setRating(server, value),
          })),
          'separator' as const,
          { text: t('Без оценки'), action: () => void store.setRating(server, 0) },
        ],
      },
    online &&
      server.some((song) => !state.downloads[song.id]) && {
        text: t('Скачать для прослушивания без сети'),
        action: () => void store.download(server),
      },
    server.some((song) => store.isAutomatic(song)) && { text: t('Сохранить для офлайна'), action: () => void store.download(server) },
    options.onRemove && 'separator',
    options.onRemove && { text: options.removeLabel ?? t('Удалить'), action: options.onRemove },
  ]
}

/**
 * Таблица треков, как в нативных плеерах: клик выделяет, двойной клик играет, Shift и Ctrl (⌘ на Mac)
 * выделяют несколько, правый клик — меню для всего выделенного, строки перетаскиваются в плейлисты,
 * в очередь и — в плейлисте — меняют порядок. Заголовки колонок сортируют список.
 */
export function SongList({
  songs,
  numbered = false,
  browse = false,
  showAlbum = false,
  onRemove,
  removeLabel = t('Удалить'),
  listKey,
  onReorder,
  onDropSongs,
}: {
  songs: Song[]
  numbered?: boolean
  browse?: boolean
  showAlbum?: boolean
  /** Удаление выделенного: треки и их позиции в исходном списке. */
  onRemove?: (songs: Song[], indexes: number[]) => void
  removeLabel?: string
  /** Имя списка для перетаскивания внутри него: без него строки можно только унести. */
  listKey?: string
  onReorder?: (from: number[], to: number) => void
  onDropSongs?: (songs: Song[], insertAt?: number) => void
}) {
  const { queue, starredIds, playing, downloads, downloading, client, offline } = useStore()
  const currentId = queue?.current?.song.id
  const online = !!client && !offline
  const [query, setQuery] = useState('')
  const [revealId, setRevealId] = useState<string>()
  const listRef = useRef<HTMLDivElement>(null)
  const [sort, setSort] = useState<Sort>()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const anchor = useRef<number | undefined>(undefined)
  const drag = useDrag()

  // Строки в показанном порядке, с позицией в исходном списке: сортировка не меняет сам список.
  // Колонка номера по самому длинному номеру: «145» не влезал в 24 px и съезжал влево от кнопки ▶.
  const numberDigits = String(numbered ? Math.max(0, ...songs.map((song, index) => song.track ?? index + 1)) : songs.length).length
  const numberWidth = `${Math.max(2, numberDigits) + 1}ch`

  const rows = useMemo(() => {
    const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
    const text = normalize(query.trim())
    const indexed = songs.map((song, index) => ({ song, index })).filter(({ song }) => !text || normalize(`${song.title} ${song.artist ?? ''} ${song.album ?? ''}`).includes(text))
    if (!sort) return indexed
    const value = (song: Song): string | number => {
      switch (sort.key) {
        case 'created': return song.created ? Date.parse(song.created) || 0 : 0
        case 'artist': return (song.artist ?? '').toLocaleLowerCase()
        case 'title': return song.title.toLocaleLowerCase()
        case 'album': return (song.album ?? '').toLocaleLowerCase()
        case 'rating': return store.ratingOf(song)
        case 'duration': return song.duration ?? 0
      }
    }
    const sorted = [...indexed].sort((a, b) => {
      const left = value(a.song)
      const right = value(b.song)
      const order = typeof left === 'number' ? left - (right as number) : left.localeCompare(right as string, 'ru')
      return (sort.descending ? -order : order) || a.index - b.index
    })
    return sorted
  }, [songs, sort, query])

  // Список сменился (другой альбом, плейлист обновился) — старое выделение ни к чему.
  useEffect(() => {
    setSelected(new Set())
    anchor.current = undefined
  }, [songs, sort, query])

  const reorderable = !!onReorder && !sort && !query.trim()
  useEffect(() => {
    if (!listKey) return
    return registerDrop(listKey, (payload: DragPayload, insertAt?: number) => {
      if (payload.source?.list === listKey) {
        if (reorderable && insertAt !== undefined) onReorder?.(payload.source.indexes, insertAt)
        return
      }
      onDropSongs?.(payload.songs, insertAt)
    })
  }, [listKey, reorderable, onReorder, onDropSongs])

  useEffect(() => {
    if (!revealId) return
    const position = rows.findIndex(({ song }) => song.id === revealId)
    if (position >= 0) {
      listRef.current?.querySelector(`[data-song-row="${position}"]`)?.scrollIntoView({ block: 'center' })
      setSelected(new Set([position]))
      setRevealId(undefined)
    }
  }, [revealId, rows])

  if (!songs.length) return <p className="px-1 text-secondary">{t('Здесь пока пусто.')}</p>

  const selectedRows = rows.filter((_, position) => selected.has(position))
  const selectedSongs = selectedRows.map((row) => row.song)
  const playFrom = (position: number) => void store.play(rows.map((row) => row.song), position)

  const select = (position: number, event: React.MouseEvent | React.KeyboardEvent) => {
    const toggle = event.metaKey || event.ctrlKey
    if (event.shiftKey && anchor.current !== undefined) {
      const [from, to] = [Math.min(anchor.current, position), Math.max(anchor.current, position)]
      const range = new Set(toggle ? selected : [])
      for (let index = from; index <= to; index++) range.add(index)
      setSelected(range)
      return
    }
    anchor.current = position
    if (toggle) {
      const next = new Set(selected)
      if (next.has(position)) next.delete(position)
      else next.add(position)
      setSelected(next)
    } else setSelected(new Set([position]))
  }

  const remove = onRemove && (() => onRemove(selectedSongs, selectedRows.map((row) => row.index)))

  const openMenu = (position: number) => {
    const chosen = selected.has(position) ? selectedRows : [rows[position]!]
    if (!selected.has(position)) {
      setSelected(new Set([position]))
      anchor.current = position
    }
    const chosenSongs = chosen.map((row) => row.song)
    void popupMenu(
      songMenu(chosenSongs, {
        removeLabel,
        onRemove: onRemove && (() => onRemove(chosenSongs, chosen.map((row) => row.index))),
        playAll: chosen.length === 1 ? () => playFrom(position) : undefined,
      }),
    )
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const mod = event.metaKey || event.ctrlKey
    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      event.stopPropagation()
      setSelected(new Set(rows.map((_, position) => position)))
    } else if (event.key === 'Enter' && selected.size) {
      event.preventDefault()
      if (selected.size === 1) playFrom([...selected][0]!)
      else void store.play(selectedSongs, 0)
    } else if ((event.key === 'Delete' || (event.key === 'Backspace' && mod)) && selected.size && remove) {
      event.preventDefault()
      event.stopPropagation()
      remove()
    } else if (event.key === 'Escape' && selected.size) {
      event.stopPropagation()
      setSelected(new Set())
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !mod) {
      event.preventDefault()
      const last = anchor.current ?? -1
      const next = Math.min(Math.max(last + (event.key === 'ArrowDown' ? 1 : -1), 0), rows.length - 1)
      if (event.shiftKey && anchor.current !== undefined) {
        setSelected(new Set([...selected, next]))
        anchor.current = next
      } else {
        anchor.current = next
        setSelected(new Set([next]))
      }
      listRef.current?.querySelector(`[data-song-row="${next}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }

  const header = (key: SortKey | undefined, label: string, className: string) => (
    <button
      disabled={!key}
      onClick={() =>
        key &&
        setSort(sort?.key !== key ? { key, descending: false } : sort.descending ? undefined : { key, descending: true })
      }
      className={`flex items-center gap-1 truncate text-left text-xs font-medium text-secondary enabled:hover:text-primary ${className}`}
    >
      {label}
      {key && sort?.key === key && <Icon name="chevronDown" size={10} className={sort.descending ? '' : 'rotate-180'} />}
    </button>
  )

  const dropHere = (position: number) => drag?.target === listKey && reorderable && drag?.insertAt === position

  return (
    <div className="space-y-3">
      {(browse || songs.length >= 20) && <>
      <div className="flex flex-wrap items-center gap-2">
        <input className="field min-w-40 flex-1" aria-label={t('Поиск в списке')} placeholder={t('Поиск в списке')} value={query} onChange={(event) => setQuery(event.target.value)} />
        <select className="field w-auto" aria-label={t('Порядок треков')} value={sort ? `${sort.key}:${sort.descending}` : ''} onChange={(event) => {
          const [key, descending] = event.target.value.split(':')
          setSort(key ? { key: key as SortKey, descending: descending === 'true' } : undefined)
        }}>
          <option value="">{t('Порядок альбома')}</option>
          <option value="title:false">{t('По названию')}</option>
          <option value="artist:false">{t('По исполнителю')}</option>
          <option value="duration:false">{t('По длительности')}</option>
          <option value="created:true">{t('Сначала новые')}</option>
          {sort && !['title:false', 'artist:false', 'duration:false', 'created:true'].includes(`${sort.key}:${sort.descending}`) && <option value={`${sort.key}:${sort.descending}`}>
            {t(({ title: 'Название', artist: 'Исполнитель', album: 'Альбом', rating: 'Оценка', duration: 'Время', created: 'Сначала новые' })[sort.key])} {sort.descending ? '↓' : '↑'}
          </option>}
        </select>
        <button className="btn" disabled={!currentId || !songs.some((song) => song.id === currentId)} onClick={() => { setQuery(''); setRevealId(currentId) }}>{t('Текущий трек')}</button>
        {selectedSongs.length > 0 && <button className="btn" onClick={() => void popupMenu(songMenu(selectedSongs, { onRemove: remove, removeLabel }))}>{t('Выбрано: {n}', { n: selectedSongs.length })}</button>}
      </div>
      <p className="text-xs text-secondary" aria-live="polite">{rows.length} / {songs.length}</p>
      </>}
    <div ref={listRef} className="song-table card overflow-hidden p-1" tabIndex={0} onKeyDown={onKeyDown} role="grid" aria-multiselectable>
      <div className="flex items-center gap-4 border-b border-stroke px-3 pb-1.5 pt-1">
        <span className="shrink-0 text-center text-xs text-secondary" style={{ width: numberWidth }}>#</span>
        {header('title', t('Название'), 'min-w-0 flex-1')}
        {showAlbum && header('album', t('Альбом'), 'hidden w-[24%] min-w-0 md:flex')}
        {online && header('rating', t('Оценка'), 'w-[88px]')}
        {header('duration', t('Время'), 'w-12 justify-end')}
        <span className="w-[68px]" />
      </div>
      <ol>
        {rows.map(({ song, index }, position) => {
          const current = song.id === currentId
          const starred = starredIds.has(song.id)
          const local = isLocalId(song.id)
          const downloaded = !!downloads[song.id]
          const playable = store.isPlayable(song)
          const isSelected = selected.has(position)
          return (
            <li
              key={`${song.id}-${index}`}
              data-song-row={position}
              {...(listKey ? { 'data-drop-row': position, 'data-drop-list': listKey } : {})}
              aria-selected={isSelected}
              onMouseDown={(event) => {
                if ((event.target as HTMLElement).closest('button')) return
                beginDrag(event, () => {
                  const chosen = isSelected ? selectedRows : [rows[position]!]
                  return {
                    songs: chosen.map((row) => row.song),
                    source: listKey ? { list: listKey, indexes: chosen.map((row) => row.index) } : undefined,
                  }
                })
              }}
              onClick={(event) => select(position, event)}
              onDoubleClick={() => playable && playFrom(position)}
              onContextMenu={(event) => {
                event.preventDefault()
                openMenu(position)
              }}
              className={`song-row list-row group relative flex items-center gap-4 rounded-[var(--radius-control)] px-3 py-1.5 ${
                isSelected ? 'is-selected' : current ? 'bg-surface' : ''
              } ${playable ? '' : 'opacity-40'} ${dropHere(position) ? 'drop-before' : ''} ${
                dropHere(position + 1) && position === rows.length - 1 ? 'drop-after' : ''
              }`}
              title={playable ? undefined : t('Трек не скачан — недоступен без сети')}
            >
              <span className="relative grid shrink-0 place-items-center text-sm tabular-nums" style={{ width: numberWidth }}>
                <span className={`group-hover:invisible ${current ? 'text-accent-text' : 'text-secondary'}`}>
                  {current ? <Icon name={playing ? 'volume' : 'note'} size={14} /> : numbered ? song.track ?? index + 1 : position + 1}
                </span>
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    if (playable) playFrom(position)
                  }}
                  className="invisible absolute inset-0 grid place-items-center text-primary group-hover:visible"
                  aria-label={t('Играть «{title}»', { title: song.title })}
                  tabIndex={-1}
                >
                  <Icon name="play" size={12} />
                </button>
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${current ? 'text-accent-text' : ''}`}>{song.title}</span>
                <span className="block truncate text-xs text-secondary">
                  {song.artistId ? (
                    <button
                      className="hover:text-primary hover:underline"
                      onClick={(event) => {
                        event.stopPropagation()
                        store.openArtistOf(song)
                      }}
                      tabIndex={-1}
                    >
                      {song.artist}
                    </button>
                  ) : (
                    (song.artist ?? t('Неизвестный исполнитель'))
                  )}
                  {showAlbum && song.album ? <span className="md:hidden">{` · ${song.album}`}</span> : ''}
                </span>
              </span>
              {showAlbum && (
                <span className="hidden w-[24%] min-w-0 truncate text-sm text-secondary md:block">
                  {song.albumId ? (
                    <button
                      className="truncate hover:text-primary hover:underline"
                      onClick={(event) => {
                        event.stopPropagation()
                        store.openAlbumOf(song)
                      }}
                      tabIndex={-1}
                    >
                      {song.album}
                    </button>
                  ) : (
                    song.album
                  )}
                </span>
              )}
              {online && <span className="w-[88px]">{!local && <Rating song={song} />}</span>}
              <span className="flex w-12 items-center justify-end gap-1.5 text-xs tabular-nums text-secondary">
                {downloading[song.id] && <span className="animate-pulse">…</span>}
                {downloaded && (
                  <span title={t('Скачано')}>
                    <Icon name="download" size={11} />
                  </span>
                )}
                {formatTime(song.duration)}
              </span>
              <span className="flex w-[68px] items-center justify-end gap-0.5">
                {!local && online && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      void store.toggleStar(song)
                    }}
                    className={`icon-btn h-8 w-8 ${starred ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
                    aria-pressed={starred}
                    title={starred ? t('Убрать из избранного') : t('В избранное')}
                    aria-label={starred ? t('Убрать из избранного') : t('В избранное')}
                  >
                    <Icon name={starred ? 'heartFilled' : 'heart'} size={14} />
                  </button>
                )}
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    openMenu(position)
                  }}
                  className="icon-btn h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  title={t('Ещё')}
                  aria-label={t('Ещё')}
                >
                  <Icon name="more" size={14} />
                </button>
              </span>
            </li>
          )
        })}
      </ol>
      {selected.size > 1 && (
        <div className="px-3 pb-1 pt-2 text-xs text-secondary">
          {t('Выбрано: {n}', { n: selected.size })} · {formatTime(selectedSongs.reduce((sum, song) => sum + (song.duration ?? 0), 0))}
        </div>
      )}
    </div>
    </div>
  )
}
