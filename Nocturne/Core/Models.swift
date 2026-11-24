import Foundation

struct Album: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var name: String
    var artist: String?
    var coverArt: String?
    var songCount: Int?
    var year: Int?
    var starred: String?
    var song: [Song]?
}

struct Song: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var title: String
    var artist: String?
    var album: String?
    /// Нужен «Авто» выравниванию громкости: альбом подряд узнаётся по соседям с тем же альбомом.
    var albumId: String?
    var coverArt: String?
    var duration: Double?
    var suffix: String?
    var bitRate: Int?
    var samplingRate: Int?
    var bitDepth: Int?
    var size: Int64?
    var created: String?
    var track: Int?
    var starred: String?
    var userRating: Int?
    var genre: String?
    /// OpenSubsonic ReplayGain values in dB.
    var replayGain: ReplayGain?
}

struct ReplayGain: Codable, Hashable, Sendable {
    var trackGain: Double?
    var albumGain: Double?
    var trackPeak: Double?
    var albumPeak: Double?
}

struct RadioStation: Decodable, Hashable, Identifiable, Sendable {
    let id: String
    var name: String
    var streamUrl: String
    var homePageUrl: String?
}
struct RadioList: Decodable, Sendable { var internetRadioStation: [RadioStation]? }
struct ArtistInfo: Decodable, Sendable { var biography: String?; var largeImageUrl: String? }
struct AlbumInfo: Decodable, Sendable { var notes: String? }
struct Share: Decodable, Sendable { var url: String }
struct ShareList: Decodable, Sendable { var share: [Share]? }

struct MusicPlaylist: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var name: String
    var songCount: Int?
    var coverArt: String?
    var entry: [Song]?
}

struct Artist: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var name: String
    var albumCount: Int?
    var coverArt: String?
    var album: [Album]?
}

struct AlbumList: Decodable, Sendable { var album: [Album]? }
struct PlaylistList: Decodable, Sendable { var playlist: [MusicPlaylist]? }
struct ArtistIndex: Decodable, Sendable { var artist: [Artist]? }
struct ArtistList: Decodable, Sendable { var index: [ArtistIndex]? }
struct SearchResult: Decodable, Sendable {
    var album: [Album]?
    var song: [Song]?
    var artist: [Artist]?
}

struct SongList: Decodable, Sendable { var song: [Song]? }
struct Starred: Decodable, Sendable { var song: [Song]?; var album: [Album]?; var artist: [Artist]? }
struct Genre: Decodable, Hashable, Identifiable, Sendable {
    let value: String
    var songCount: Int?
    var albumCount: Int?
    var id: String { value }
}
struct GenreList: Decodable, Sendable { var genre: [Genre]? }

/// OpenSubsonic structured lyrics; `start` is in milliseconds when `synced` is true.
struct LyricLine: Decodable, Hashable, Sendable { var start: Int?; var value: String }
struct StructuredLyrics: Decodable, Sendable { var lang: String?; var synced: Bool; var line: [LyricLine]? }
struct LyricsList: Decodable, Sendable { var structuredLyrics: [StructuredLyrics]? }
struct PlainLyrics: Decodable, Sendable { var value: String? }

/// Play queue stored on the server by any client: lets a song started on one device continue on another.
struct PlayQueue: Decodable, Sendable {
    var entry: [Song]?
    var current: String?
    /// Milliseconds into the current song.
    var position: Int64?
    /// ISO 8601 time of the last save.
    var changed: String?
    /// Client name (`c` parameter) of whoever saved it: "Nocturne" here, "NocturneDesktop" on computers.
    var changedBy: String?

    var positionSeconds: Double { Double(position ?? 0) / 1000 }
    var changedAt: Date? {
        guard let changed else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: changed) ?? ISO8601DateFormatter().date(from: changed)
    }
}

struct ServerError: Decodable, Sendable { let code: Int; let message: String? }
struct ServerResponse: Decodable, Sendable {
    let status: String
    var error: ServerError?
    var albumList2: AlbumList?
    var album: Album?
    var playlists: PlaylistList?
    var playlist: MusicPlaylist?
    var artists: ArtistList?
    var artist: Artist?
    var searchResult3: SearchResult?
    var starred2: Starred?
    var topSongs: SongList?
    var randomSongs: SongList?
    var genres: GenreList?
    var lyricsList: LyricsList?
    var lyrics: PlainLyrics?
    var similarSongs2: SongList?
    var internetRadioStations: RadioList?
    var artistInfo2: ArtistInfo?
    var albumInfo: AlbumInfo?
    var shares: ShareList?
    var playQueue: PlayQueue?
}

struct ResponseEnvelope: Decodable, Sendable {
    let response: ServerResponse
    enum CodingKeys: String, CodingKey { case response = "subsonic-response" }
}

enum MusicError: LocalizedError {
    case invalidServer, http(Int), server(Int), invalidResponse, keychain, demo, offline
    var errorDescription: String? {
        switch self {
        case .invalidServer: String(localized: "Укажи HTTPS-адрес сервера без логина, параметров и фрагмента. HTTP разрешён только для локальной сети.")
        case .http(let code): String(localized: "Сервер вернул HTTP \(code). Проверь адрес и доступность Navidrome.")
        case .server(let code): code == 40 ? String(localized: "Неверный логин или пароль.") : String(localized: "Ошибка Navidrome (\(code)).")
        case .invalidResponse: String(localized: "Сервер вернул неожиданный ответ. Проверь адрес Navidrome.")
        case .keychain: String(localized: "Не удалось сохранить данные в Связке ключей.")
        case .demo: String(localized: "Это демомедиатека. Подключи Navidrome, чтобы слушать свою музыку.")
        case .offline: String(localized: "Нет подключения к сети.")
        }
    }
}

enum DemoLibrary {
    // Названия демомедиатеки переводятся вместе с интерфейсом: на английском устройстве русские
    // альбомы выглядели бы чужими — и в App Store тоже.
    static let albums: [Album] = [
        Album(id: "demo-0", name: String(localized: "Параллели"), artist: String(localized: "Свет внутри"), coverArt: "demo-0", songCount: 5, year: 2025),
        Album(id: "demo-1", name: String(localized: "Тихие дни"), artist: String(localized: "Корали"), coverArt: "demo-1", songCount: 5, year: 2024),
        Album(id: "demo-2", name: String(localized: "Где-то дальше"), artist: String(localized: "Монолит"), coverArt: "demo-2", songCount: 5, year: 2025),
        Album(id: "demo-3", name: String(localized: "Поздний июль"), artist: String(localized: "Небо рядом"), coverArt: "demo-3", songCount: 5, year: 2024),
        Album(id: "demo-4", name: "Afterglow", artist: "North Coast", coverArt: "demo-4", songCount: 5, year: 2025),
        Album(id: "demo-5", name: String(localized: "Сны на повторе"), artist: String(localized: "Каменные реки"), coverArt: "demo-5", songCount: 5, year: 2023)
    ]
    /// Только реальные элементы демокаталога: серверный ID с похожим префиксом не подходит.
    static func audioAsset(for songID: String) -> String? {
        for album in albums {
            for track in 0..<5 where songID == "\(album.id)-\(track)" {
                return "DemoAudio\(track)"
            }
        }
        return nil
    }

    static func songs(for album: Album) -> [Song] {
        [String(localized: "Первый свет"), String(localized: "Между нами"), String(localized: "Тишина"), "Afterglow", String(localized: "Остаться")].enumerated().map {
            Song(id: "\(album.id)-\($0.offset)", title: $0.element, artist: album.artist,
                 album: album.name, coverArt: album.coverArt, duration: 24, track: $0.offset + 1)
        }
    }
}

enum SongOrder: String, CaseIterable {
    case original, title, artist, duration, newest
    var title: String {
        switch self {
        case .original: String(localized: "Порядок альбома")
        case .title: String(localized: "По названию")
        case .artist: String(localized: "По исполнителю")
        case .duration: String(localized: "По длительности")
        case .newest: String(localized: "Сначала новые")
        }
    }
    func apply(_ songs: [Song], query: String) -> [Song] {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let rows = songs.enumerated().filter { _, song in
            text.isEmpty || [song.title, song.artist ?? "", song.album ?? ""].joined(separator: " ").range(of: text, options: [.caseInsensitive, .diacriticInsensitive]) != nil
        }
        return rows.sorted { a, b in
            let order: ComparisonResult
            switch self {
            case .original: return a.offset < b.offset
            case .title: order = a.element.title.localizedStandardCompare(b.element.title)
            case .artist: order = (a.element.artist ?? "").localizedStandardCompare(b.element.artist ?? "")
            case .duration:
                let left = a.element.duration ?? 0, right = b.element.duration ?? 0
                return left == right ? a.offset < b.offset : left < right
            case .newest:
                let left = Self.date(a.element.created), right = Self.date(b.element.created)
                return left == right ? a.offset < b.offset : left > right
            }
            return order == .orderedSame ? a.offset < b.offset : order == .orderedAscending
        }.map(\.element)
    }
    private static func date(_ value: String?) -> Date {
        guard let value else { return .distantPast }
        return (try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(value))
            ?? (try? Date.ISO8601FormatStyle().parse(value)) ?? .distantPast
    }
}
