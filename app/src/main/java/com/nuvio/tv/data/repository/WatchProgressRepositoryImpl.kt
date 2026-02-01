package com.nuvio.tv.data.repository

import com.nuvio.tv.data.local.WatchProgressPreferences
import com.nuvio.tv.domain.model.WatchProgress
import com.nuvio.tv.domain.repository.WatchProgressRepository
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WatchProgressRepositoryImpl @Inject constructor(
    private val watchProgressPreferences: WatchProgressPreferences
) : WatchProgressRepository {

    override val allProgress: Flow<List<WatchProgress>>
        get() = watchProgressPreferences.allProgress

    override val continueWatching: Flow<List<WatchProgress>>
        get() = watchProgressPreferences.continueWatching

    override fun getProgress(contentId: String): Flow<WatchProgress?> {
        return watchProgressPreferences.getProgress(contentId)
    }

    override fun getEpisodeProgress(contentId: String, season: Int, episode: Int): Flow<WatchProgress?> {
        return watchProgressPreferences.getEpisodeProgress(contentId, season, episode)
    }

    override fun getAllEpisodeProgress(contentId: String): Flow<Map<Pair<Int, Int>, WatchProgress>> {
        return watchProgressPreferences.getAllEpisodeProgress(contentId)
    }

    override suspend fun saveProgress(progress: WatchProgress) {
        watchProgressPreferences.saveProgress(progress)
    }

    override suspend fun removeProgress(contentId: String, season: Int?, episode: Int?) {
        watchProgressPreferences.removeProgress(contentId, season, episode)
    }

    override suspend fun markAsCompleted(progress: WatchProgress) {
        watchProgressPreferences.markAsCompleted(progress)
    }

    override suspend fun clearAll() {
        watchProgressPreferences.clearAll()
    }
}
