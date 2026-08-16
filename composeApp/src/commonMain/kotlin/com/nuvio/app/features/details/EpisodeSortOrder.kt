package com.nuvio.app.features.details

internal enum class EpisodeSortOrder {
    Ascending,
    Descending,
    ;

    fun toggled(): EpisodeSortOrder = when (this) {
        Ascending -> Descending
        Descending -> Ascending
    }
}

internal fun List<MetaVideo>.orderedForEpisodeDisplay(
    order: EpisodeSortOrder,
): List<MetaVideo> = withIndex()
    .sortedWith { left, right ->
        val leftNumber = left.value.validEpisodeNumber()
        val rightNumber = right.value.validEpisodeNumber()
        when {
            leftNumber == null && rightNumber == null -> left.index.compareTo(right.index)
            leftNumber == null -> 1
            rightNumber == null -> -1
            leftNumber == rightNumber -> left.index.compareTo(right.index)
            order == EpisodeSortOrder.Ascending -> leftNumber.compareTo(rightNumber)
            else -> rightNumber.compareTo(leftNumber)
        }
    }
    .map(IndexedValue<MetaVideo>::value)

private fun MetaVideo.validEpisodeNumber(): Int? =
    episode?.takeIf { it > 0 }
