package com.nuvio.tv.core.plugin

import android.util.Log
import com.nuvio.tv.data.local.PluginDataStore
import com.nuvio.tv.domain.model.LocalScraperResult
import com.nuvio.tv.domain.model.PluginManifest
import com.nuvio.tv.domain.model.PluginRepository
import com.nuvio.tv.domain.model.ScraperInfo
import com.nuvio.tv.domain.model.ScraperManifestInfo
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "PluginManager"
private const val MAX_CONCURRENT_SCRAPERS = 5
private const val MAX_RESULT_ITEMS = 150
private const val MAX_RESPONSE_SIZE = 5 * 1024 * 1024L

@Singleton
class PluginManager @Inject constructor(
    private val dataStore: PluginDataStore,
    private val runtime: PluginRuntime
) {
    private val moshi = Moshi.Builder()
        .addLast(KotlinJsonAdapterFactory())
        .build()
    
    private val manifestAdapter = moshi.adapter(PluginManifest::class.java)
    
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private fun sha256Hex(text: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(text.toByteArray(Charsets.UTF_8))
        val sb = StringBuilder(digest.size * 2)
        for (b in digest) {
            sb.append(((b.toInt() shr 4) and 0xF).toString(16))
            sb.append((b.toInt() and 0xF).toString(16))
        }
        return sb.toString()
    }
    
    // Single-flight map to prevent duplicate scraper executions
    private val inFlightScrapers = ConcurrentHashMap<String, kotlinx.coroutines.Deferred<List<LocalScraperResult>>>()
    
    // Semaphore to limit concurrent scrapers
    private val scraperSemaphore = Semaphore(MAX_CONCURRENT_SCRAPERS)
    
    // Flow of all repositories
    val repositories: Flow<List<PluginRepository>> = dataStore.repositories
    
    // Flow of all scrapers
    val scrapers: Flow<List<ScraperInfo>> = dataStore.scrapers
    
    // Flow of plugins enabled state
    val pluginsEnabled: Flow<Boolean> = dataStore.pluginsEnabled
    
    // Combined flow of enabled scrapers
    val enabledScrapers: Flow<List<ScraperInfo>> = combine(
        scrapers,
        pluginsEnabled
    ) { scraperList, enabled ->
        if (enabled) scraperList.filter { it.enabled } else emptyList()
    }
    
    /**
     * Add a new repository from manifest URL
     */
    suspend fun addRepository(manifestUrl: String): Result<PluginRepository> = withContext(Dispatchers.IO) {
        try {
            Log.d(TAG, "Adding repository from: $manifestUrl")
            
            // Fetch manifest
            val manifest = fetchManifest(manifestUrl)
                ?: return@withContext Result.failure(Exception("Failed to fetch manifest"))
            
            // Create repository
            val repo = PluginRepository(
                id = UUID.randomUUID().toString(),
                name = manifest.name,
                url = manifestUrl,
                enabled = true,
                lastUpdated = System.currentTimeMillis(),
                scraperCount = manifest.scrapers.size
            )
            
            // Save repository
            dataStore.addRepository(repo)
            
            // Download and save scrapers
            downloadScrapers(repo.id, manifestUrl, manifest.scrapers)
            
            Log.d(TAG, "Repository added: ${repo.name} with ${manifest.scrapers.size} scrapers")
            Result.success(repo)
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add repository: ${e.message}", e)
            Result.failure(e)
        }
    }
    
    /**
     * Remove a repository and its scrapers
     */
    suspend fun removeRepository(repoId: String) {
        val scraperList = dataStore.scrapers.first()
        
        // Remove all scrapers from this repo
        scraperList.filter { it.repositoryId == repoId }.forEach { scraper ->
            dataStore.deleteScraperCode(scraper.id)
        }
        
        // Remove scrapers from list
        val updatedScrapers = scraperList.filter { it.repositoryId != repoId }
        dataStore.saveScrapers(updatedScrapers)
        
        // Remove repository
        dataStore.removeRepository(repoId)
    }
    
    /**
     * Refresh a repository - re-download manifest and scrapers
     */
    suspend fun refreshRepository(repoId: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val repo = dataStore.repositories.first().find { it.id == repoId }
                ?: return@withContext Result.failure(Exception("Repository not found"))
            
            val manifest = fetchManifest(repo.url)
                ?: return@withContext Result.failure(Exception("Failed to fetch manifest"))
            
            // Update repository
            val updatedRepo = repo.copy(
                name = manifest.name,
                lastUpdated = System.currentTimeMillis(),
                scraperCount = manifest.scrapers.size
            )
            dataStore.updateRepository(updatedRepo)
            
            // Re-download scrapers
            downloadScrapers(repo.id, repo.url, manifest.scrapers)
            
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to refresh repository: ${e.message}", e)
            Result.failure(e)
        }
    }
    
    /**
     * Toggle scraper enabled state
     */
    suspend fun toggleScraper(scraperId: String, enabled: Boolean) {
        val scraperList = dataStore.scrapers.first()
        val updatedScrapers = scraperList.map { scraper ->
            if (scraper.id == scraperId) scraper.copy(enabled = enabled) else scraper
        }
        dataStore.saveScrapers(updatedScrapers)
    }
    
    /**
     * Toggle plugins globally enabled
     */
    suspend fun setPluginsEnabled(enabled: Boolean) {
        dataStore.setPluginsEnabled(enabled)
    }
    
    /**
     * Execute all enabled scrapers for a given media
     */
    suspend fun executeScrapers(
        tmdbId: String,
        mediaType: String,
        season: Int? = null,
        episode: Int? = null
    ): List<LocalScraperResult> = coroutineScope {
        if (!dataStore.pluginsEnabled.first()) {
            return@coroutineScope emptyList()
        }
        
        val enabledScraperList = enabledScrapers.first()
            .filter { it.supportsType(mediaType) }
        
        if (enabledScraperList.isEmpty()) {
            return@coroutineScope emptyList()
        }
        
        Log.d(TAG, "Executing ${enabledScraperList.size} scrapers for $mediaType:$tmdbId")
        
        val results = enabledScraperList.map { scraper ->
            async {
                executeScraperWithSingleFlight(scraper, tmdbId, mediaType, season, episode)
            }
        }.awaitAll()
        
        results.flatten()
            .distinctBy { it.url }
            .take(MAX_RESULT_ITEMS)
    }
    
    /**
     * Execute all enabled scrapers and emit results as each scraper completes.
     * Returns a Flow that emits (scraperName, results) pairs.
     */
    fun executeScrapersStreaming(
        tmdbId: String,
        mediaType: String,
        season: Int? = null,
        episode: Int? = null
    ): Flow<Pair<String, List<LocalScraperResult>>> = channelFlow {
        val enabledList = enabledScrapers.first()
            .filter { it.supportsType(mediaType) }
        
        if (enabledList.isEmpty() || !dataStore.pluginsEnabled.first()) {
            return@channelFlow
        }
        
        Log.d(TAG, "Streaming execution of ${enabledList.size} scrapers for $mediaType:$tmdbId")
        
        // Launch all scrapers concurrently within the channelFlow scope
        enabledList.forEach { scraper ->
            launch {
                try {
                    val results = executeScraperWithSingleFlight(scraper, tmdbId, mediaType, season, episode)
                    if (results.isNotEmpty()) {
                        send(scraper.name to results)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Scraper ${scraper.name} failed in streaming: ${e.message}")
                }
            }
        }
    }
    
    /**
     * Execute a single scraper with single-flight deduplication
     */
    private suspend fun executeScraperWithSingleFlight(
        scraper: ScraperInfo,
        tmdbId: String,
        mediaType: String,
        season: Int?,
        episode: Int?
    ): List<LocalScraperResult> {
        val cacheKey = "${scraper.id}:$tmdbId:$mediaType:$season:$episode"
        
        // Check if already in flight
        val existing = inFlightScrapers[cacheKey]
        if (existing != null) {
            return try {
                existing.await()
            } catch (e: Exception) {
                emptyList()
            }
        }
        
        // Create new deferred
        return coroutineScope {
            val deferred = async {
                scraperSemaphore.withPermit {
                    executeScraper(scraper, tmdbId, mediaType, season, episode)
                }
            }
            
            inFlightScrapers[cacheKey] = deferred
            
            try {
                deferred.await()
            } catch (e: Exception) {
                Log.e(TAG, "Scraper ${scraper.name} failed: ${e.message}")
                emptyList()
            } finally {
                inFlightScrapers.remove(cacheKey)
            }
        }
    }
    
    /**
     * Execute a single scraper
     */
    suspend fun executeScraper(
        scraper: ScraperInfo,
        tmdbId: String,
        mediaType: String,
        season: Int?,
        episode: Int?
    ): List<LocalScraperResult> {
        return try {
            val code = dataStore.getScraperCode(scraper.id)
            if (code.isNullOrBlank()) {
                Log.w(TAG, "No code found for scraper: ${scraper.name}")
                return emptyList()
            }

            // Debug: confirm which exact JS code is running on-device.
            try {
                val sha = sha256Hex(code)
                val bytes = code.toByteArray(Charsets.UTF_8).size
                val hasHrefliLogs = code.contains("[UHDMovies][Hrefli]", ignoreCase = false) ||
                    code.contains("[Hrefli]", ignoreCase = false)
                Log.d(
                    TAG,
                    "Scraper code loaded: ${scraper.name}(${scraper.id}) bytes=$bytes sha256=${sha.take(12)} hrefliLogs=$hasHrefliLogs"
                )
            } catch (_: Exception) {
                // ignore
            }
            
            val settings = dataStore.getScraperSettings(scraper.id)
            
            Log.d(TAG, "Executing scraper: ${scraper.name}")
            val results = runtime.executePlugin(
                code = code,
                tmdbId = tmdbId,
                mediaType = mediaType,
                season = season,
                episode = episode,
                scraperId = scraper.id,
                scraperSettings = settings
            )
            
            Log.d(TAG, "Scraper ${scraper.name} returned ${results.size} results")
            results.map { it.copy(provider = scraper.name) }
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to execute scraper ${scraper.name}: ${e.message}", e)
            emptyList()
        }
    }
    
    /**
     * Test a scraper with sample data
     */
    suspend fun testScraper(scraperId: String): Result<List<LocalScraperResult>> {
        val scraper = dataStore.scrapers.first().find { it.id == scraperId }
            ?: return Result.failure(Exception("Scraper not found"))
        
        // Use a popular movie for testing (The Matrix - 603)
        val testTmdbId = "603"
        val testMediaType = if (scraper.supportsType("movie")) "movie" else "series"
        
        return try {
            val results = executeScraper(scraper, testTmdbId, testMediaType, 1, 1)
            Result.success(results)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    private suspend fun fetchManifest(url: String): PluginManifest? = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "NuvioTV/1.0")
                .build()
            
            val response = httpClient.newCall(request).execute()
            if (!response.isSuccessful) {
                Log.e(TAG, "Failed to fetch manifest: ${response.code}")
                return@withContext null
            }
            
            val body = response.body?.string() ?: return@withContext null
            manifestAdapter.fromJson(body)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching manifest: ${e.message}", e)
            null
        }
    }
    
    private suspend fun downloadScrapers(
        repoId: String,
        manifestUrl: String,
        scraperInfos: List<ScraperManifestInfo>
    ) = withContext(Dispatchers.IO) {
        val baseUrl = manifestUrl.substringBeforeLast("/")
        val existingScrapers = dataStore.scrapers.first().toMutableList()
        
        scraperInfos.forEach { info ->
            try {
                val codeUrl = if (info.filename.startsWith("http")) {
                    info.filename
                } else {
                    "$baseUrl/${info.filename}"
                }
                
                // Check response size before downloading
                val headRequest = Request.Builder()
                    .url(codeUrl)
                    .head()
                    .build()
                
                val headResponse = httpClient.newCall(headRequest).execute()
                val contentLength = headResponse.header("Content-Length")?.toLongOrNull() ?: 0
                
                if (contentLength > MAX_RESPONSE_SIZE) {
                    Log.w(TAG, "Scraper ${info.name} too large: $contentLength bytes")
                    return@forEach
                }
                
                // Download code
                val codeRequest = Request.Builder()
                    .url(codeUrl)
                    .header("User-Agent", "NuvioTV/1.0")
                    .build()
                
                val codeResponse = httpClient.newCall(codeRequest).execute()
                if (!codeResponse.isSuccessful) {
                    Log.e(TAG, "Failed to download scraper ${info.name}: ${codeResponse.code}")
                    return@forEach
                }
                
                val code = codeResponse.body?.string() ?: return@forEach

                try {
                    val sha = sha256Hex(code)
                    val hasHrefliLogs = code.contains("[UHDMovies][Hrefli]", ignoreCase = false) ||
                        code.contains("[Hrefli]", ignoreCase = false)
                    Log.d(
                        TAG,
                        "Downloaded scraper code: ${info.name}(${info.id}) bytes=${code.toByteArray(Charsets.UTF_8).size} sha256=${sha.take(12)} hrefliLogs=$hasHrefliLogs url=$codeUrl"
                    )
                } catch (_: Exception) {
                    // ignore
                }
                
                // Create scraper info
                val scraperId = "$repoId:${info.id}"
                val scraper = ScraperInfo(
                    id = scraperId,
                    repositoryId = repoId,
                    name = info.name,
                    description = info.description ?: "",
                    version = info.version,
                    filename = info.filename,
                    supportedTypes = info.supportedTypes,
                    enabled = true,
                    manifestEnabled = info.enabled,
                    logo = info.logo,
                    contentLanguage = info.contentLanguage ?: emptyList(),
                    formats = info.formats
                )
                
                // Save code
                dataStore.saveScraperCode(scraperId, code)
                
                // Update scraper list
                existingScrapers.removeAll { it.id == scraperId }
                existingScrapers.add(scraper)
                
                Log.d(TAG, "Downloaded scraper: ${info.name}")
                
            } catch (e: Exception) {
                Log.e(TAG, "Error downloading scraper ${info.name}: ${e.message}", e)
            }
        }
        
        dataStore.saveScrapers(existingScrapers)
    }
}
