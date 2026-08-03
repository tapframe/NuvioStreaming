package com.nuvio.app.core.format

import kotlin.math.abs

/**
 * Formats a TMDB money amount for display.
 *
 * TMDB reports budget and revenue in whole US dollars and uses `0` to mean "unknown" rather than
 * omitting the field, so callers should treat non-positive values as missing.
 *
 * kotlin.text has no locale-aware number formatter in common code, so grouping is done by hand with
 * plain commas — which matches how TMDB itself renders these figures.
 */
fun formatUsdAmountForDisplay(amount: Long?): String? {
    if (amount == null || amount <= 0L) return null
    return "$" + groupThousands(amount)
}

private fun groupThousands(value: Long): String {
    val digits = abs(value).toString()
    val builder = StringBuilder()
    for ((index, char) in digits.withIndex()) {
        if (index > 0 && (digits.length - index) % 3 == 0) {
            builder.append(',')
        }
        builder.append(char)
    }
    return builder.toString()
}
