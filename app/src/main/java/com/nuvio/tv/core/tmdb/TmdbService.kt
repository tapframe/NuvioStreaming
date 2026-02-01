package com.nuvio.tv.core.tmdb

import android.util.Log
import com.nuvio.tv.data.remote.api.TmdbApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "TmdbService"
private const val TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"

/**
 * Service to handle TMDB ID conversions and lookups.
 * Provides caching to avoid redundant API calls.
 */
@Singleton
class TmdbService @Inject constructor(
    private val tmdbApi: TmdbApi
) {
    // Cache: IMDB ID -> TMDB ID
    private val imdbToTmdbCache = ConcurrentHashMap<String, Int>()
    
    // Cache: TMDB ID -> IMDB ID  
    private val tmdbToImdbCache = ConcurrentHashMap<Int, String>()
    
    // Mutex for thread-safe cache operations
    private val cacheMutex = Mutex()
    
    /**
     * Convert an IMDB ID to a TMDB ID.
     * 
     * @param imdbId The IMDB ID (e.g., "tt0133093")
     * @param mediaType The media type ("movie" or "series"/"tv")
     * @return The TMDB ID, or null if not found
     */
    suspend fun imdbToTmdb(imdbId: String, mediaType: String): Int? = withContext(Dispatchers.IO) {
        // Validate IMDB ID format
        if (!imdbId.startsWith("tt")) {
            Log.w(TAG, "Invalid IMDB ID format: $imdbId")
            return@withContext null
        }
        
        // Check cache first
        imdbToTmdbCache[imdbId]?.let { cached ->
            Log.d(TAG, "Cache hit: IMDB $imdbId -> TMDB $cached")
            return@withContext cached
        }
        
        try {
            Log.d(TAG, "Looking up TMDB ID for IMDB: $imdbId (type: $mediaType)")
            
            val response = tmdbApi.findByExternalId(
                externalId = imdbId,
                apiKey = TMDB_API_KEY,
                externalSource = "imdb_id"
            )
            
            if (!response.isSuccessful) {
                Log.e(TAG, "TMDB API error: ${response.code()} - ${response.message()}")
                return@withContext null
            }
            
            val body = response.body() ?: return@withContext null
            
            // Determine which results to use based on media type
            val normalizedType = normalizeMediaType(mediaType)
            val result = when (normalizedType) {
                "movie" -> body.movieResults?.firstOrNull()
                "tv", "series" -> body.tvResults?.firstOrNull()
                else -> body.movieResults?.firstOrNull() ?: body.tvResults?.firstOrNull()
            }
            
            result?.let { found ->
                Log.d(TAG, "Found TMDB ID: ${found.id} for IMDB: $imdbId")
                
                // Cache both directions
                cacheMutex.withLock {
                    imdbToTmdbCache[imdbId] = found.id
                    tmdbToImdbCache[found.id] = imdbId
                }
                
                return@withContext found.id
            }
            
            Log.w(TAG, "No TMDB result found for IMDB: $imdbId")
            null
            
        } catch (e: Exception) {
            Log.e(TAG, "Error looking up TMDB ID for $imdbId: ${e.message}", e)
            null
        }
    }
    
    /**
     * Convert a TMDB ID to an IMDB ID.
     * 
     * @param tmdbId The TMDB ID
     * @param mediaType The media type ("movie" or "series"/"tv")
     * @return The IMDB ID, or null if not found
     */
    suspend fun tmdbToImdb(tmdbId: Int, mediaType: String): String? = withContext(Dispatchers.IO) {
        // Check cache first
        tmdbToImdbCache[tmdbId]?.let { cached ->
            Log.d(TAG, "Cache hit: TMDB $tmdbId -> IMDB $cached")
            return@withContext cached
        }
        
        try {
            Log.d(TAG, "Looking up IMDB ID for TMDB: $tmdbId (type: $mediaType)")
            
            val normalizedType = normalizeMediaType(mediaType)
            val response = when (normalizedType) {
                "movie" -> tmdbApi.getMovieExternalIds(tmdbId, TMDB_API_KEY)
                "tv", "series" -> tmdbApi.getTvExternalIds(tmdbId, TMDB_API_KEY)
                else -> tmdbApi.getMovieExternalIds(tmdbId, TMDB_API_KEY)
            }
            
            if (!response.isSuccessful) {
                Log.e(TAG, "TMDB API error: ${response.code()} - ${response.message()}")
                return@withContext null
            }
            
            val body = response.body() ?: return@withContext null
            
            body.imdbId?.let { imdbId ->
                Log.d(TAG, "Found IMDB ID: $imdbId for TMDB: $tmdbId")
                
                // Cache both directions
                cacheMutex.withLock {
                    tmdbToImdbCache[tmdbId] = imdbId
                    imdbToTmdbCache[imdbId] = tmdbId
                }
                
                return@withContext imdbId
            }
            
            Log.w(TAG, "No IMDB ID found for TMDB: $tmdbId")
            null
            
        } catch (e: Exception) {
            Log.e(TAG, "Error looking up IMDB ID for $tmdbId: ${e.message}", e)
            null
        }
    }
    
    /**
     * Get a TMDB ID from a video ID string.
     * Handles both IMDB IDs (tt...) and TMDB IDs.
     * 
     * @param videoId The video ID (can be IMDB or TMDB format)
     * @param mediaType The media type
     * @return The TMDB ID as a string, or null if conversion failed
     */
    suspend fun ensureTmdbId(videoId: String, mediaType: String): String? {
        // Check if it's already a TMDB ID (numeric or prefixed)
        val cleanId = videoId
            .removePrefix("tmdb:")
            .removePrefix("movie:")
            .removePrefix("series:")

        // Stremio-style series ids can look like: tt1234567:season:episode
        // Plugins/TMDB lookup need the base external id only.
        val idPart = cleanId
            .substringBefore(':')
            .substringBefore('/')
            .trim()
        
        // If it's an IMDB ID, convert it
        if (idPart.startsWith("tt")) {
            val tmdbId = imdbToTmdb(idPart, normalizeMediaType(mediaType))
            return tmdbId?.toString()
        }
        
        // If it looks like a numeric ID, assume it's already a TMDB ID
        if (idPart.all { it.isDigit() }) {
            return idPart
        }
        
        // Unknown format
        Log.w(TAG, "Unknown video ID format: $videoId")
        return null
    }
    
    /**
     * Normalize media type to consistent format
     */
    private fun normalizeMediaType(mediaType: String): String {
        return when (mediaType.lowercase()) {
            "series", "tv", "show", "tvshow" -> "tv"
            "movie", "film" -> "movie"
            else -> mediaType.lowercase()
        }
    }
    
    /**
     * Clear all caches
     */
    fun clearCache() {
        imdbToTmdbCache.clear()
        tmdbToImdbCache.clear()
        Log.d(TAG, "Cache cleared")
    }
    
    /**
     * Pre-populate cache with known mappings
     */
    fun preCacheMapping(imdbId: String, tmdbId: Int) {
        imdbToTmdbCache[imdbId] = tmdbId
        tmdbToImdbCache[tmdbId] = imdbId
    }
}
