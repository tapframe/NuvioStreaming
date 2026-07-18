# Plano: Faixa de áudio local (Android, ExoPlayer)

## Decisões
- Escopo: Android phone only (SAF não funciona em Android TV).
- Engine: ExoPlayer-only.
- Persistência: sessão-only (não toca PlayerSettingsStorage).
- Picker: SAF nativo (`ACTION_OPEN_DOCUMENT`, `audio/*`) + `takePersistableUriPermission` → zero permissões de storage.
- Áudio local reutiliza o path `sourceAudioUrl` existente (merge via `MergingMediaSource`).
- Offset de áudio: bidirecional ±1000ms via renderer wrapper (estilo `subtitleDelayMs` / `SubtitleOffsetRenderer`).
- Logs: arquivo texto em `ctx.filesDir/local_audio_debug.log` (append + timestamp) em zonas críticas.

## Como o pause/seek já funciona (sem código extra)
Vídeo + áudio local formam UMA `MergingMediaSource` num único `ExoPlayer` (`PlayerEngine.android.kt:277-293`).
`play/pause/seekTo/seekBy` do `PlayerEngineController` (linhas 549-564) operam no player único.
→ Pausar/seek do vídeo arrasta o áudio local junto. Verificar manualmente, não implementar.

## Arquivos e mudanças

### 1. NOVO `LocalAudioLogFile.android.kt` (androidMain)
Helper:
```kotlin
fun appendLocalAudioLog(message: String) {
    val file = File(context.filesDir, "local_audio_debug.log")
    file.appendText("${timestamp()} ${message}\n")
}
```
Função `expect`/`actual` (commonMain declara `expect fun logLocalAudio(message: String)`;
androidMain escreve em arquivo; iosMain no-op).

### 2. NOVO `LocalAudioPicker.android.kt` (androidMain)
- `expect fun rememberLocalAudioPicker(onPicked: (String) -> Unit)` (commonMain) / `actual` android:
  `rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument(), arrayOf("audio/*"))`.
  No resultado: `contentResolver.takePersistableUriPermission(uri, FLAG_GRANT_READ_URI_PERMISSION)`
  → `onPicked(uri.toString())`.
- iosMain `actual`: no-op (não suportado).

### 3. `PlayerScreenRuntimeState.kt` (commonMain)
Adicionar:
- `var localAudioUri: String? = null`
- `var audioDelayMs by mutableStateOf(0)` (sessão-only)
- (check) `hasLocalAudio: Boolean get() = localAudioUri != null`

### 4. `PlayerEngine.android.kt` (androidMain) — ExoPlayerSurface
a) `playerSourceKey` (213-220): já inclui `sourceAudioUrl`. Trocar `activeSourceAudioUrl` força
   re-prepare automático. ✅ Nada a mudar no memo, só garantir que `sourceAudioUrl` param receba a Uri.
b) NOVO `AudioOffsetRenderersFactory` (espelhar `SubtitleOffsetRenderersFactory` 1578-1603):
   estende `DefaultRenderersFactory`, override `buildAudioRenderers(...)` — envolve cada audio renderer
   em `AudioOffsetRenderer(baseRenderer, audioDelayUsProvider)` que ajusta `positionUs` (estilo
   `SubtitleOffsetRenderer` 1674-1683).
c) Usar `AudioOffsetRenderersFactory` no `.setRenderersFactory(...)` (linha 304 / 353), com
   `audioDelayUsProvider = { audioDelayMs * 1000L }`.
d) Logs: `appendLocalAudioLog("import uri=$uri mime=$mime engine=ExoPlayer")` ao montar merge;
   `appendLocalAudioLog("offsetMs=$audioDelayMs applied")` ao mudar offset.

### 5. `AudioTrackModal.kt` (commonMain)
- Params novos: `onLocalAudioPicked: () -> Unit`, `localAudioUri: String?`,
  `audioDelayMs: Int`, `onAudioDelayChanged: (Int) -> Unit`, `onRemoveLocalAudio: () -> Unit`,
  `showLocalAudioOption: Boolean` (só ExoPlayer).
- Botão "Carregar arquivo de áudio" no topo do modal (quando `showLocalAudioOption`).
- Quando `localAudioUri != null`: linha destacada "Arquivo local" + botão remover.
- Slider de offset ±1000ms (estilo `subtitleDelayMs`), visível quando `localAudioUri != null`.

### 6. `PlayerScreenModalHosts.kt` (commonMain)
`AudioTrackModal` (117-123): passar novos callbacks + estado do runtime.

### 7. `PlayerScreenRuntimeUi.kt` (commonMain)
- Montar `rememberLocalAudioPicker { uri -> runtime.localAudioUri = uri; runtime.activeSourceAudioUrl = uri; logLocalAudio(...) }`.
- `onLocalAudioPicked` → dispara launcher.
- `onAudioDelayChanged` → `runtime.audioDelayMs = it`.
- `onRemoveLocalAudio` → `runtime.localAudioUri = null; runtime.activeSourceAudioUrl = args.sourceAudioUrl`.
- `showLocalAudioOption = playerSettings.androidPlaybackEngine != Libmpv`.

### 8. Strings (values/strings.xml + locales afetados)
`compose_player_load_local_audio`, `compose_player_local_audio_active`,
`compose_player_remove_local_audio`, `compose_player_audio_offset`.

## Verificação (manual, sessão-only)
1. Player → modal áudio → "Carregar" → escolher .mp3 → vídeo toca com áudio do arquivo (merge ok).
2. Pausar vídeo → áudio local pausa junto. Seek → ambos juntos.
3. Slider offset ±1000ms → áudio adiantra/atrasa em relação ao vídeo.
4. "Remover" → volta áudio do stream original.
5. Trocar stream/episódio → `localAudioUri` some (sessão-only).
6. `local_audio_debug.log` em `filesDir` contém entradas de import + offset.
