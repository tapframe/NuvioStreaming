package com.nuvio.app.features.player

import android.os.Bundle
import android.os.Parcel
import kotlin.test.Test
import kotlin.test.assertEquals
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class SubtitleModalLazyKeyTest {

    @Test
    fun addonAndBuiltInRowsUseBundleRoundTrippableKeys() {
        val addon = AddonSubtitle(
            id = "duplicate",
            url = "https://signed.example/subtitle.srt?token=secret",
            language = "en",
            display = "English",
            addonName = "Fixture",
            providerOrigin = "https://provider.example/manifest.json",
            providerSubtitleId = "duplicate",
        )
        val addonEntry = AddonSubtitleSessionRegistry().reconcile(listOf(addon)).single()
        val selectionKeys = listOf(
            SubtitleSelectionKey.BuiltIn(trackIndex = 0, trackId = "embedded-en"),
            SubtitleSelectionKey.Addon(addonEntry.identity),
        )
        val lazyKeys = SubtitleOptionLazyKeyRegistry()
        val bundle = Bundle()

        selectionKeys.forEachIndexed { index, key ->
            bundle.putString(index.toString(), lazyKeys.keyFor(key))
        }
        val parcel = Parcel.obtain()
        bundle.writeToParcel(parcel, 0)
        parcel.setDataPosition(0)
        val restored = Bundle.CREATOR.createFromParcel(parcel)

        selectionKeys.forEachIndexed { index, key ->
            assertEquals(lazyKeys.keyFor(key), restored.getString(index.toString()))
        }
        parcel.recycle()
    }
}
