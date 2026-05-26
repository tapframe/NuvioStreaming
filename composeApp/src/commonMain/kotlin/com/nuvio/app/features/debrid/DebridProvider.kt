package com.nuvio.app.features.debrid

data class DebridProvider(
    val id: String,
    val displayName: String,
    val shortName: String,
    val visibleInUi: Boolean = true,
    val authMethod: DebridProviderAuthMethod = DebridProviderAuthMethod.ApiKey,
    val capabilities: Set<DebridProviderCapability> = emptySet(),
)

data class DebridServiceCredential(
    val provider: DebridProvider,
    val apiKey: String,
)

enum class DebridProviderCapability {
    ClientResolve,
    LocalTorrentCacheCheck,
    LocalTorrentResolve,
    CloudLibrary,
}

enum class DebridProviderAuthMethod {
    ApiKey,
    DeviceCode,
}

object DebridProviders {
    const val TORBOX_ID = "torbox"
    const val PREMIUMIZE_ID = "premiumize"
    const val REAL_DEBRID_ID = "realdebrid"

    val Torbox = DebridProvider(
        id = TORBOX_ID,
        displayName = "Torbox",
        shortName = "TB",
        authMethod = DebridProviderAuthMethod.DeviceCode,
        capabilities = setOf(
            DebridProviderCapability.ClientResolve,
            DebridProviderCapability.LocalTorrentCacheCheck,
            DebridProviderCapability.LocalTorrentResolve,
            DebridProviderCapability.CloudLibrary,
        ),
    )

    val Premiumize = DebridProvider(
        id = PREMIUMIZE_ID,
        displayName = "Premiumize",
        shortName = "PM",
        authMethod = DebridProviderAuthMethod.DeviceCode,
        capabilities = setOf(
            DebridProviderCapability.ClientResolve,
            DebridProviderCapability.LocalTorrentCacheCheck,
            DebridProviderCapability.LocalTorrentResolve,
            DebridProviderCapability.CloudLibrary,
        ),
    )

    val RealDebrid = DebridProvider(
        id = REAL_DEBRID_ID,
        displayName = "Real-Debrid",
        shortName = "RD",
        visibleInUi = false,
        capabilities = setOf(DebridProviderCapability.ClientResolve),
    )

    private val registered = listOf(Torbox, Premiumize, RealDebrid)

    fun all(): List<DebridProvider> = registered

    fun visible(): List<DebridProvider> = registered.filter { it.visibleInUi }

    fun byId(id: String?): DebridProvider? {
        val normalized = id?.trim()?.takeIf { it.isNotBlank() } ?: return null
        return registered.firstOrNull { it.id.equals(normalized, ignoreCase = true) }
    }

    fun isSupported(id: String?): Boolean = byId(id) != null

    fun isVisible(id: String?): Boolean = byId(id)?.visibleInUi == true

    fun instantName(id: String?): String = "${displayName(id)} Instant"

    fun addonId(id: String?): String =
        "debrid:${byId(id)?.id ?: id?.trim().orEmpty().ifBlank { "unknown" }}"

    fun displayName(id: String?): String =
        byId(id)?.displayName ?: id.toFallbackDisplayName()

    fun shortName(id: String?): String =
        byId(id)?.shortName ?: id?.trim()?.takeIf { it.isNotBlank() }?.uppercase().orEmpty()

    fun configuredServices(settings: DebridSettings): List<DebridServiceCredential> =
        registered.mapNotNull { provider ->
            settings.apiKeyFor(provider.id)
                .trim()
                .takeIf { provider.visibleInUi && it.isNotBlank() }
                ?.let { apiKey -> DebridServiceCredential(provider, apiKey) }
        }

    fun configuredResolverServices(settings: DebridSettings): List<DebridServiceCredential> =
        configuredServices(settings).filter { credential ->
            credential.provider.supports(DebridProviderCapability.ClientResolve) ||
                credential.provider.supports(DebridProviderCapability.LocalTorrentResolve)
        }

    fun preferredResolverService(settings: DebridSettings): DebridServiceCredential? {
        val services = configuredResolverServices(settings)
        if (services.isEmpty()) return null
        val preferredId = byId(settings.preferredResolverProviderId)?.id
        return services.firstOrNull { it.provider.id == preferredId } ?: services.firstOrNull()
    }

    fun configuredSourceNames(settings: DebridSettings): List<String> =
        configuredServices(settings).map { instantName(it.provider.id) }

    private fun String?.toFallbackDisplayName(): String {
        val value = this?.trim()?.takeIf { it.isNotBlank() } ?: return "Debrid"
        return value
            .replace('-', ' ')
            .replace('_', ' ')
            .split(' ')
            .filter { it.isNotBlank() }
            .joinToString(" ") { part ->
                part.lowercase().replaceFirstChar { it.titlecase() }
            }
            .ifBlank { "Debrid" }
    }
}

fun DebridProvider.supports(capability: DebridProviderCapability): Boolean =
    capability in capabilities
