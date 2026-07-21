package com.nuvio.app.core.tracking

import com.nuvio.app.features.simkl.SimklAuthRepository
import com.nuvio.app.features.simkl.SimklMutationRepository
import com.nuvio.app.features.simkl.SimklLibraryRepository
import com.nuvio.app.features.simkl.SimklProgressRepository
import com.nuvio.app.features.simkl.SimklSyncRepository
import com.nuvio.app.features.trakt.TraktAuthRepository
import com.nuvio.app.features.trakt.TraktScrobbleRepository

fun ensureTrackingProvidersRegistered() {
    TraktAuthRepository.descriptor
    TraktScrobbleRepository.ensureRegistered()
    SimklAuthRepository.descriptor
    SimklSyncRepository.state
    SimklLibraryRepository.uiState
    SimklProgressRepository.uiState
    SimklMutationRepository.ensureRegistered()
}
