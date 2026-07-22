package com.nuvio.app.features.simkl

import kotlin.test.Test
import kotlin.test.assertEquals

class SimklSettingsPolicyTest {
    @Test
    fun `missing activity watermark does not fetch settings`() {
        assertEquals(
            SimklSettingsRefreshAction.NONE,
            simklSettingsRefreshAction(SimklStoredAuthState(), null),
        )
    }

    @Test
    fun `first activity watermark is recorded after sign in settings fetch`() {
        assertEquals(
            SimklSettingsRefreshAction.RECORD_WATERMARK,
            simklSettingsRefreshAction(
                state = SimklStoredAuthState(hasFetchedUserSettings = true),
                activityWatermark = "2026-07-22T08:48:07Z",
            ),
        )
    }

    @Test
    fun `changed activity watermark fetches settings and matching watermark skips`() {
        val state = SimklStoredAuthState(
            hasFetchedUserSettings = true,
            settingsActivityWatermark = "2026-07-22T08:48:07Z",
        )

        assertEquals(
            SimklSettingsRefreshAction.NONE,
            simklSettingsRefreshAction(state, "2026-07-22T08:48:07Z"),
        )
        assertEquals(
            SimklSettingsRefreshAction.FETCH,
            simklSettingsRefreshAction(state, "2026-07-22T09:12:30Z"),
        )
    }

    @Test
    fun `legacy auth state fetches once before recording a watermark`() {
        assertEquals(
            SimklSettingsRefreshAction.FETCH,
            simklSettingsRefreshAction(
                state = SimklStoredAuthState(username = "Nuvio User"),
                activityWatermark = "2026-07-22T08:48:07Z",
            ),
        )
    }
}
