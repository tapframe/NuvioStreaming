package com.nuvio.app.features.membership

import co.touchlab.kermit.Logger
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.auth.AuthState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

object MembershipOverviewRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val log = Logger.withTag("MembershipOverviewRepository")
    private val refreshGeneration = MutableStateFlow(0L)
    private val _state = MutableStateFlow(MembershipOverviewState())
    val state: StateFlow<MembershipOverviewState> = _state.asStateFlow()
    private var started = false
    private var currentUserId: String? = null

    fun ensureStarted() {
        if (started) return
        started = true
        scope.launch {
            combine(AuthRepository.state, refreshGeneration) { auth, _ -> auth }
                .collectLatest(::loadOverview)
        }
    }

    fun refresh() {
        ensureStarted()
        refreshGeneration.value += 1L
    }

    private suspend fun loadOverview(auth: AuthState) {
        if (auth is AuthState.Loading) {
            _state.value = MembershipOverviewState()
            return
        }

        val account = auth as? AuthState.Authenticated
        if (account == null || account.isAnonymous) {
            currentUserId = null
            _state.value = MembershipOverviewState(
                overview = MembershipOverview(),
                isLoading = false,
            )
            return
        }

        val previous = _state.value.overview.takeIf { currentUserId == account.userId }
        currentUserId = account.userId
        _state.value = MembershipOverviewState(
            overview = previous,
            isLoading = previous == null,
            isRefreshing = previous != null,
        )

        try {
            val overview = MembershipOverviewRemoteDataSource.getMembershipOverview()
            _state.value = MembershipOverviewState(
                overview = overview,
                isLoading = false,
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            log.w(error) { "Unable to load membership overview" }
            _state.value = MembershipOverviewState(
                overview = previous,
                isLoading = false,
                errorMessage = error.message,
            )
        }
    }
}
