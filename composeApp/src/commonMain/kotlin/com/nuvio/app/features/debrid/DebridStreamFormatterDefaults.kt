package com.nuvio.app.features.debrid

object DebridStreamFormatterDefaults {
    const val NAME_TEMPLATE = "{stream.resolution::exists[\"{stream.resolution} \"||\"\"]}{service.shortName::exists[\"{service.shortName}\"||\"Cloud\"]} Instant"

    const val DESCRIPTION_TEMPLATE = ""

    const val LEGACY_NAME_TEMPLATE = "{stream.resolution::=2160p[\"4K \"||\"\"]}{stream.resolution::=1440p[\"QHD \"||\"\"]}{stream.resolution::=1080p[\"FHD \"||\"\"]}{stream.resolution::=720p[\"HD \"||\"\"]}{service.shortName::exists[\"{service.shortName} \"||\"Debrid \"]}{service.cached::istrue[\"Ready\"||\"Not Ready\"]}"

    const val LEGACY_DESCRIPTION_TEMPLATE = "{stream.title::exists[\"{stream.title::title} \"||\"\"]}{stream.year::exists[\"({stream.year})\"||\"\"]}\n{stream.quality::exists[\"{stream.quality} \"||\"\"]}{stream.visualTags::exists[\"{stream.visualTags::join(' | ')} \"||\"\"]}{stream.encode::exists[\"{stream.encode} \"||\"\"]}\n{stream.audioTags::exists[\"{stream.audioTags::join(' | ')}\"||\"\"]}{stream.audioTags::exists::and::stream.audioChannels::exists[\" | \"||\"\"]}{stream.audioChannels::exists[\"{stream.audioChannels::join(' | ')}\"||\"\"]}\n{stream.size::>0[\"{stream.size::bytes} \"||\"\"]}{stream.releaseGroup::exists[\"{stream.releaseGroup} \"||\"\"]}{stream.indexer::exists[\"{stream.indexer}\"||\"\"]}\n{service.cached::istrue[\"Ready\"||\"Not Ready\"]}{service.shortName::exists[\" ({service.shortName})\"||\"\"]}{stream.filename::exists[\"\n{stream.filename}\"||\"\"]}"
}
