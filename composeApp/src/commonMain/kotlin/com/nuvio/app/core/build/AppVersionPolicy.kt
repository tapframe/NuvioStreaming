package com.nuvio.app.core.build

expect object AppVersionPolicy {
    val displayVersionName: String
    val displayVersionCode: Int
    val basedOnVersionName: String?
}
