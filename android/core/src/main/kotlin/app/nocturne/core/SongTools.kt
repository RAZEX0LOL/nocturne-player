package app.nocturne.core

import java.text.Normalizer
import java.time.Instant
import java.util.Locale

enum class SongOrder(val label: String) {
    original("Порядок альбома"), title("По названию"), artist("По исполнителю"), duration("По длительности"), newest("Сначала новые");
    fun apply(songs: List<Song>, query: String): List<Song> {
        fun text(value: String) = Normalizer.normalize(value, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase(Locale.ROOT)
        val needle = text(query.trim())
        val found = songs.filter { needle.isEmpty() || text("${it.title} ${it.artist} ${it.album}").contains(needle) }
        return when (this) {
            original -> found
            title -> found.sortedBy { text(it.title) }
            artist -> found.sortedBy { text(it.artist) }
            duration -> found.sortedBy { it.duration ?: 0.0 }
            newest -> found.sortedByDescending { runCatching { Instant.parse(it.created).toEpochMilli() }.getOrDefault(Long.MIN_VALUE) }
        }
    }
}
