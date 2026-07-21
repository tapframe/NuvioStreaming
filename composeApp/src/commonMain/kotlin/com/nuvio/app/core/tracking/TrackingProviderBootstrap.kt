package com.nuvio.app.core.tracking

import com.nuvio.app.features.simkl.SimklAuthRepository
import com.nuvio.app.features.simkl.SimklMutationRepository
import com.nuvio.app.features.simkl.SimklSyncRepository
import com.nuvio.app.features.trakt.TraktAuthRepository

fun ensureTrackingProvidersRegistered() {
    TraktAuthRepository.descriptor
    SimklAuthRepository.descriptor
    SimklSyncRepository.state
    SimklMutationRepository.ensureRegistered()
}
