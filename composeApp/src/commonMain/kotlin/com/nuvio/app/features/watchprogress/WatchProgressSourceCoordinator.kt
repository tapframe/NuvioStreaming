package com.nuvio.app.features.watchprogress

import co.touchlab.kermit.Logger
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.features.profiles.ProfileRepository
import com.nuvio.app.features.trakt.DEFAULT_WATCH_PROGRESS_SOURCE
import com.nuvio.app.features.trakt.TraktAuthRepository
import com.nuvio.app.features.trakt.TraktSettingsRepository
import com.nuvio.app.features.trakt.WatchProgressSource
import com.nuvio.app.features.trakt.effectiveWatchProgressSource
import com.nuvio.app.features.watched.WatchedRepository
import kotlinx.atomicfu.atomic
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class WatchProgressSourceTransitionState(
    val profileId: Int? = null,
    val requestedSource: WatchProgressSource = DEFAULT_WATCH_PROGRESS_SOURCE,
    val effectiveSource: WatchProgressSource = WatchProgressSource.NUVIO_SYNC,
    val isRefreshing: Boolean = false,
    val lastRefreshSucceeded: Boolean? = null,
)

data class WatchProgressSourceTransitionResult(
    val requestedSource: WatchProgressSource,
    val effectiveSource: WatchProgressSource,
    val progressRefreshed: Boolean,
    val watchedHistoryRefreshed: Boolean,
) {
    val succeeded: Boolean
        get() = progressRefreshed && watchedHistoryRefreshed
}

internal data class WatchProgressSourceContext(
    val profileId: Int,
    val requestedSource: WatchProgressSource,
    val effectiveSource: WatchProgressSource,
    val isNuvioAuthenticated: Boolean,
)

internal fun resolveSerializedWatchProgressContext(
    queuedContext: WatchProgressSourceContext,
    currentContext: WatchProgressSourceContext,
): WatchProgressSourceContext? = currentContext.takeIf {
    it.profileId == queuedContext.profileId
}

internal class WatchProgressSourceTransitionRunner(
    private val currentAppliedSource: () -> WatchProgressSource? = { null },
    private val invalidateCache: (profileId: Int, source: WatchProgressSource) -> Unit,
    private val activateProgressSource: (WatchProgressSource) -> Unit,
    private val activateWatchedSource: (WatchProgressSource) -> Unit,
    private val refreshProgress: suspend (
        profileId: Int,
        source: WatchProgressSource,
        sourceChanged: Boolean,
        force: Boolean,
    ) -> Boolean,
    private val refreshWatched: suspend (
        profileId: Int,
        source: WatchProgressSource,
        force: Boolean,
    ) -> Boolean,
) {
    private val transitionMutex = Mutex()
    private val lifecycleLock = SynchronizedObject()
    private var lifecycleGeneration: Long = 0L
    private var lastAppliedContext: WatchProgressSourceContext? = null

    fun currentGeneration(): Long = synchronized(lifecycleLock) {
        lifecycleGeneration
    }

    suspend fun transition(
        context: WatchProgressSourceContext,
        refreshIfUnchanged: Boolean,
        forceSnapshot: Boolean,
        transitionGeneration: Long = currentGeneration(),
    ): WatchProgressSourceTransitionResult = transitionMutex.withLock {
        val (previousContext, sourceChanged) = synchronized(lifecycleLock) {
            ensureCurrentGeneration(transitionGeneration)
            val previous = lastAppliedContext
            val currentSourceDiffers = currentAppliedSource()
                ?.let { appliedSource -> appliedSource != context.effectiveSource }
                ?: false
            val lastSuccessfulContextDiffers = previous?.let { successfulContext ->
                successfulContext.profileId != context.profileId ||
                    successfulContext.effectiveSource != context.effectiveSource
            } ?: false
            val changed = currentSourceDiffers || lastSuccessfulContextDiffers

            if (changed) {
                invalidateCache(context.profileId, context.effectiveSource)
            }
            activateWatchedSource(context.effectiveSource)
            activateProgressSource(context.effectiveSource)
            previous to changed
        }

        if (!refreshIfUnchanged && !sourceChanged && previousContext == context) {
            return@withLock WatchProgressSourceTransitionResult(
                requestedSource = context.requestedSource,
                effectiveSource = context.effectiveSource,
                progressRefreshed = true,
                watchedHistoryRefreshed = true,
            )
        }

        val (progressRefreshed, watchedHistoryRefreshed) = coroutineScope {
            val progress = synchronized(lifecycleLock) {
                ensureCurrentGeneration(transitionGeneration)
                async(start = CoroutineStart.UNDISPATCHED) {
                    runRefresh {
                        refreshProgress(
                            context.profileId,
                            context.effectiveSource,
                            sourceChanged,
                            forceSnapshot,
                        )
                    }
                }
            }
            val watched = synchronized(lifecycleLock) {
                ensureCurrentGeneration(transitionGeneration)
                async(start = CoroutineStart.UNDISPATCHED) {
                    runRefresh {
                        refreshWatched(
                            context.profileId,
                            context.effectiveSource,
                            forceSnapshot,
                        )
                    }
                }
            }
            progress.await() to watched.await()
        }

        if (progressRefreshed && watchedHistoryRefreshed) {
            synchronized(lifecycleLock) {
                ensureCurrentGeneration(transitionGeneration)
                lastAppliedContext = context
            }
        } else {
            synchronized(lifecycleLock) {
                ensureCurrentGeneration(transitionGeneration)
            }
        }
        WatchProgressSourceTransitionResult(
            requestedSource = context.requestedSource,
            effectiveSource = context.effectiveSource,
            progressRefreshed = progressRefreshed,
            watchedHistoryRefreshed = watchedHistoryRefreshed,
        )
    }

    fun reset() = synchronized(lifecycleLock) {
        lifecycleGeneration += 1L
        lastAppliedContext = null
    }

    private fun ensureCurrentGeneration(expectedGeneration: Long) {
        if (expectedGeneration != lifecycleGeneration) {
            throw CancellationException("Watch progress source transition belongs to a cleared account")
        }
    }

    private suspend fun runRefresh(block: suspend () -> Boolean): Boolean =
        try {
            block()
        } catch (error: CancellationException) {
            throw error
        } catch (_: Throwable) {
            false
        }
}

object WatchProgressSourceCoordinator {
    private val log = Logger.withTag("ProgressSourceCoordinator")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val startLock = SynchronizedObject()
    private val transitionStateMutex = Mutex()
    private var observeJob: Job? = null
    private var lifecycleGeneration: Long = 0L
    private val automaticTransitionPauseCount = atomic(0)

    private val _uiState = MutableStateFlow(WatchProgressSourceTransitionState())
    val uiState: StateFlow<WatchProgressSourceTransitionState> = _uiState.asStateFlow()

    private val runner = WatchProgressSourceTransitionRunner(
        currentAppliedSource = { WatchProgressRepository.activeSourceState.value },
        invalidateCache = ContinueWatchingEnrichmentCache::invalidate,
        activateProgressSource = WatchProgressRepository::activateSource,
        activateWatchedSource = { source -> WatchedRepository.activateSource(source) },
        refreshProgress = WatchProgressRepository::refreshForSource,
        refreshWatched = WatchedRepository::refreshForSource,
    )

    fun ensureStarted() {
        val expectedGeneration = synchronized(startLock) { lifecycleGeneration }
        ensureStartedForGeneration(expectedGeneration)
    }

    private fun ensureStartedForGeneration(expectedGeneration: Long) {
        val generationIsCurrent = synchronized(startLock) {
            expectedGeneration == lifecycleGeneration
        }
        if (!generationIsCurrent) return

        ensureSourceStateLoaded()

        synchronized(startLock) {
            if (expectedGeneration != lifecycleGeneration) return
            if (observeJob?.isActive == true) return
            observeJob = scope.launch {
                combine(
                    TraktSettingsRepository.uiState,
                    TraktAuthRepository.isAuthenticated,
                    AuthRepository.state,
                    ProfileRepository.state,
                ) { settings, isTraktAuthenticated, authState, profileState ->
                    buildContext(
                        profileId = profileState.activeProfile?.profileIndex
                            ?: ProfileRepository.activeProfileId,
                        requestedSource = settings.watchProgressSource,
                        isTraktAuthenticated = isTraktAuthenticated,
                        authState = authState,
                    )
                }
                    .distinctUntilChanged()
                    .collectLatest { context ->
                        if (automaticTransitionPauseCount.value > 0) return@collectLatest
                        runTransition(
                            context = context,
                            refreshIfUnchanged = false,
                            forceSnapshot = true,
                        )
                    }
            }
        }
    }

    private fun ensureSourceStateLoaded() {
        TraktAuthRepository.ensureLoaded()
        TraktSettingsRepository.ensureLoaded()
    }

    suspend fun selectSource(
        profileId: Int,
        source: WatchProgressSource,
    ): WatchProgressSourceTransitionResult {
        val operationGeneration = synchronized(startLock) { lifecycleGeneration }
        ensureSourceStateLoadedForGeneration(operationGeneration)
        synchronized(startLock) {
            ensureCoordinatorGeneration(operationGeneration)
            TraktSettingsRepository.setWatchProgressSource(source, profileId)
        }
        val context = currentContext(profileId)
        return try {
            runTransition(
                context = context,
                refreshIfUnchanged = false,
                forceSnapshot = true,
                expectedCoordinatorGeneration = operationGeneration,
            )
        } finally {
            ensureStartedForGeneration(operationGeneration)
        }
    }

    suspend fun refreshActiveSource(
        profileId: Int,
        force: Boolean = true,
    ): WatchProgressSourceTransitionResult {
        val operationGeneration = synchronized(startLock) { lifecycleGeneration }
        ensureSourceStateLoadedForGeneration(operationGeneration)
        val context = currentContext(profileId)
        return try {
            runTransition(
                context = context,
                refreshIfUnchanged = true,
                forceSnapshot = force,
                expectedCoordinatorGeneration = operationGeneration,
            )
        } finally {
            ensureStartedForGeneration(operationGeneration)
        }
    }

    private fun ensureSourceStateLoadedForGeneration(expectedGeneration: Long) {
        synchronized(startLock) {
            ensureCoordinatorGeneration(expectedGeneration)
        }
        ensureSourceStateLoaded()
        synchronized(startLock) {
            ensureCoordinatorGeneration(expectedGeneration)
        }
    }

    private fun ensureCoordinatorGeneration(expectedGeneration: Long) {
        if (expectedGeneration != lifecycleGeneration) {
            throw CancellationException("Watch progress source operation belongs to a cleared account")
        }
    }

    fun clearLocalState() {
        synchronized(startLock) {
            observeJob?.cancel()
            observeJob = null
            lifecycleGeneration += 1L
            runner.reset()
            automaticTransitionPauseCount.value = 0
            _uiState.value = WatchProgressSourceTransitionState()
        }
    }

    internal fun pauseAutomaticTransitions() {
        automaticTransitionPauseCount.incrementAndGet()
    }

    internal fun resumeAutomaticTransitions() {
        while (true) {
            val current = automaticTransitionPauseCount.value
            if (current == 0) return
            if (automaticTransitionPauseCount.compareAndSet(current, current - 1)) {
                if (current == 1) {
                    scope.launch {
                        val profileId = ProfileRepository.state.value.activeProfile?.profileIndex
                            ?: ProfileRepository.activeProfileId
                        try {
                            runTransition(
                                context = currentContext(profileId),
                                refreshIfUnchanged = false,
                                forceSnapshot = true,
                            )
                        } catch (error: CancellationException) {
                            throw error
                        } catch (error: Throwable) {
                            log.e(error) { "Failed to replay source transition after profile sync" }
                        }
                    }
                }
                return
            }
        }
    }

    private suspend fun runTransition(
        context: WatchProgressSourceContext,
        refreshIfUnchanged: Boolean,
        forceSnapshot: Boolean,
        expectedCoordinatorGeneration: Long? = null,
    ): WatchProgressSourceTransitionResult {
        currentCoroutineContext().ensureActive()
        val transitionToken = synchronized(startLock) {
            if (
                expectedCoordinatorGeneration != null &&
                expectedCoordinatorGeneration != lifecycleGeneration
            ) {
                throw CancellationException("Watch progress source operation belongs to a cleared account")
            }
            TransitionToken(
                coordinatorGeneration = lifecycleGeneration,
                runnerGeneration = runner.currentGeneration(),
            )
        }

        return transitionStateMutex.withLock {
            currentCoroutineContext().ensureActive()
            val activeProfileId = ProfileRepository.state.value.activeProfile?.profileIndex
                ?: ProfileRepository.activeProfileId
            val resolvedContext = resolveSerializedWatchProgressContext(
                queuedContext = context,
                currentContext = currentContext(activeProfileId),
            ) ?: throw CancellationException("Watch progress source transition belongs to an inactive profile")
            val started = synchronized(startLock) {
                if (transitionToken.coordinatorGeneration != lifecycleGeneration) {
                    false
                } else {
                    _uiState.value = WatchProgressSourceTransitionState(
                        profileId = resolvedContext.profileId,
                        requestedSource = resolvedContext.requestedSource,
                        effectiveSource = resolvedContext.effectiveSource,
                        isRefreshing = true,
                        lastRefreshSucceeded = null,
                    )
                    true
                }
            }
            if (!started) {
                throw CancellationException("Watch progress source transition belongs to a cleared account")
            }

            val result = try {
                runner.transition(
                    context = resolvedContext,
                    refreshIfUnchanged = refreshIfUnchanged,
                    forceSnapshot = forceSnapshot,
                    transitionGeneration = transitionToken.runnerGeneration,
                )
            } catch (error: Throwable) {
                synchronized(startLock) {
                    if (transitionToken.coordinatorGeneration == lifecycleGeneration) {
                        _uiState.value = _uiState.value.copy(
                            isRefreshing = false,
                            lastRefreshSucceeded = false,
                        )
                    }
                }
                throw error
            }
            val completed = synchronized(startLock) {
                if (transitionToken.coordinatorGeneration != lifecycleGeneration) {
                    false
                } else {
                    _uiState.value = _uiState.value.copy(
                        profileId = resolvedContext.profileId,
                        requestedSource = result.requestedSource,
                        effectiveSource = result.effectiveSource,
                        isRefreshing = false,
                        lastRefreshSucceeded = result.succeeded,
                    )
                    true
                }
            }
            if (!completed) {
                throw CancellationException("Watch progress source transition belongs to a cleared account")
            }
            if (!result.succeeded) {
                log.w {
                    "Source refresh incomplete for profile ${resolvedContext.profileId}: " +
                        "source=${resolvedContext.effectiveSource} progress=${result.progressRefreshed} " +
                        "watched=${result.watchedHistoryRefreshed}"
                }
            }
            result
        }
    }

    private data class TransitionToken(
        val coordinatorGeneration: Long,
        val runnerGeneration: Long,
    )

    private fun buildContext(
        profileId: Int,
        requestedSource: WatchProgressSource,
        isTraktAuthenticated: Boolean,
        authState: AuthState,
    ): WatchProgressSourceContext = WatchProgressSourceContext(
        profileId = profileId,
        requestedSource = requestedSource,
        effectiveSource = effectiveWatchProgressSource(
            isTraktAuthenticated = isTraktAuthenticated,
            requestedSource = requestedSource,
        ),
        isNuvioAuthenticated = authState is AuthState.Authenticated && !authState.isAnonymous,
    )

    private fun currentContext(profileId: Int): WatchProgressSourceContext = buildContext(
        profileId = profileId,
        requestedSource = TraktSettingsRepository.uiState.value.watchProgressSource,
        isTraktAuthenticated = TraktAuthRepository.isAuthenticated.value,
        authState = AuthRepository.state.value,
    )
}
