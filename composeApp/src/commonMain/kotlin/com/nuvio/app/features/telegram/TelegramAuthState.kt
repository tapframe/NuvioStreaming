package com.nuvio.app.features.telegram

sealed class TelegramAuthState {
    data object Idle : TelegramAuthState()
    data object Initializing : TelegramAuthState()
    data object WaitPhone : TelegramAuthState()
    data class WaitQr(val link: String) : TelegramAuthState()
    data class WaitCode(val codeLength: Int = 5) : TelegramAuthState()
    data object WaitPassword : TelegramAuthState()
    data class Ready(val firstName: String, val userId: Long) : TelegramAuthState()
    data class Error(val message: String) : TelegramAuthState()
}
