package com.nuvio.tv.data.mapper

import com.nuvio.tv.data.remote.dto.BehaviorHintsDto
import com.nuvio.tv.data.remote.dto.ProxyHeadersDto
import com.nuvio.tv.data.remote.dto.StreamDto
import com.nuvio.tv.domain.model.ProxyHeaders
import com.nuvio.tv.domain.model.Stream
import com.nuvio.tv.domain.model.StreamBehaviorHints

fun StreamDto.toDomain(addonName: String, addonLogo: String?): Stream = Stream(
    name = name,
    title = title,
    description = description,
    url = url,
    ytId = ytId,
    infoHash = infoHash,
    fileIdx = fileIdx,
    externalUrl = externalUrl,
    behaviorHints = behaviorHints?.toDomain(),
    addonName = addonName,
    addonLogo = addonLogo
)

fun BehaviorHintsDto.toDomain(): StreamBehaviorHints = StreamBehaviorHints(
    notWebReady = notWebReady,
    bingeGroup = bingeGroup,
    countryWhitelist = countryWhitelist,
    proxyHeaders = proxyHeaders?.toDomain()
)

fun ProxyHeadersDto.toDomain(): ProxyHeaders = ProxyHeaders(
    request = request,
    response = response
)
