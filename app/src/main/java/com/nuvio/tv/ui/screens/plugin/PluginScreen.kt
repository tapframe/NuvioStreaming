@file:OptIn(ExperimentalTvMaterial3Api::class)

package com.nuvio.tv.ui.screens.plugin

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.items
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.Icon
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.Switch
import androidx.tv.material3.SwitchDefaults
import androidx.tv.material3.Text
import com.nuvio.tv.domain.model.LocalScraperResult
import com.nuvio.tv.domain.model.PluginRepository
import com.nuvio.tv.domain.model.ScraperInfo
import com.nuvio.tv.ui.components.LoadingIndicator
import com.nuvio.tv.ui.theme.NuvioColors
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun PluginScreen(
    viewModel: PluginViewModel = hiltViewModel(),
    onBackPress: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    var showAddDialog by remember { mutableStateOf(false) }
    var repoUrl by remember { mutableStateOf("") }
    
    BackHandler {
        if (showAddDialog) {
            showAddDialog = false
        } else {
            onBackPress()
        }
    }
    
    // Clear messages after delay
    LaunchedEffect(uiState.successMessage) {
        if (uiState.successMessage != null) {
            delay(3000)
            viewModel.onEvent(PluginUiEvent.ClearSuccess)
        }
    }
    
    LaunchedEffect(uiState.errorMessage) {
        if (uiState.errorMessage != null) {
            delay(5000)
            viewModel.onEvent(PluginUiEvent.ClearError)
        }
    }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(NuvioColors.Background)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 48.dp, vertical = 24.dp)
        ) {
            // Header
            PluginHeader(
                pluginsEnabled = uiState.pluginsEnabled,
                onPluginsEnabledChange = { viewModel.onEvent(PluginUiEvent.SetPluginsEnabled(it)) },
                onAddRepository = { showAddDialog = true }
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            // Content
            TvLazyColumn(
                contentPadding = PaddingValues(bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.weight(1f)
            ) {
                // Repositories section
                item {
                    Text(
                        text = "Repositories (${uiState.repositories.size})",
                        style = MaterialTheme.typography.titleLarge,
                        color = NuvioColors.TextPrimary
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }
                
                if (uiState.repositories.isEmpty()) {
                    item {
                        EmptyState(
                            message = "No repositories added yet.\nAdd a repository to get started.",
                            modifier = Modifier.padding(vertical = 24.dp)
                        )
                    }
                }
                
                items(uiState.repositories, key = { it.id }) { repo ->
                    RepositoryCard(
                        repository = repo,
                        onRefresh = { viewModel.onEvent(PluginUiEvent.RefreshRepository(repo.id)) },
                        onRemove = { viewModel.onEvent(PluginUiEvent.RemoveRepository(repo.id)) },
                        isLoading = uiState.isLoading
                    )
                }
                
                // Scrapers section
                if (uiState.scrapers.isNotEmpty()) {
                    item {
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Providers (${uiState.scrapers.size})",
                            style = MaterialTheme.typography.titleLarge,
                            color = NuvioColors.TextPrimary
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                    }
                    
                    items(uiState.scrapers, key = { it.id }) { scraper ->
                        ScraperCard(
                            scraper = scraper,
                            onToggle = { enabled -> 
                                viewModel.onEvent(PluginUiEvent.ToggleScraper(scraper.id, enabled)) 
                            },
                            onTest = { viewModel.onEvent(PluginUiEvent.TestScraper(scraper.id)) },
                            isTesting = uiState.isTesting && uiState.testScraperId == scraper.id,
                            testResults = if (uiState.testScraperId == scraper.id) uiState.testResults else null
                        )
                    }
                }
            }
        }
        
        // Add Repository Dialog
        AnimatedVisibility(
            visible = showAddDialog,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            AddRepositoryDialog(
                url = repoUrl,
                onUrlChange = { repoUrl = it },
                onConfirm = {
                    viewModel.onEvent(PluginUiEvent.AddRepository(repoUrl))
                    repoUrl = ""
                    showAddDialog = false
                },
                onDismiss = { showAddDialog = false },
                isLoading = uiState.isAddingRepo
            )
        }
        
        // Success/Error Messages
        MessageOverlay(
            successMessage = uiState.successMessage,
            errorMessage = uiState.errorMessage
        )
    }
}

@Composable
private fun PluginHeader(
    pluginsEnabled: Boolean,
    onPluginsEnabledChange: (Boolean) -> Unit,
    onAddRepository: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(
                text = "Plugins",
                style = MaterialTheme.typography.headlineLarge,
                color = NuvioColors.TextPrimary
            )
            Text(
                text = "Manage local scrapers and providers",
                style = MaterialTheme.typography.bodyMedium,
                color = NuvioColors.TextSecondary
            )
        }
        
        Row(
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Global enable toggle
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = if (pluginsEnabled) "Enabled" else "Disabled",
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (pluginsEnabled) NuvioColors.Secondary else NuvioColors.TextSecondary
                )
                Switch(
                    checked = pluginsEnabled,
                    onCheckedChange = onPluginsEnabledChange,
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = NuvioColors.Secondary,
                        checkedTrackColor = NuvioColors.Secondary.copy(alpha = 0.3f)
                    )
                )
            }
            
            // Add button
            Button(
                onClick = onAddRepository,
                colors = ButtonDefaults.colors(
                    containerColor = NuvioColors.Primary,
                    contentColor = Color.White
                )
            ) {
                Icon(
                    imageVector = Icons.Default.Add,
                    contentDescription = "Add",
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Add Repository")
            }
        }
    }
}

@Composable
private fun RepositoryCard(
    repository: PluginRepository,
    onRefresh: () -> Unit,
    onRemove: () -> Unit,
    isLoading: Boolean
) {
    var isFocused by remember { mutableStateOf(false) }
    
    Surface(
        onClick = { },
        modifier = Modifier
            .fillMaxWidth()
            .onFocusChanged { isFocused = it.isFocused },
        colors = ClickableSurfaceDefaults.colors(
            containerColor = if (isFocused) NuvioColors.FocusBackground else NuvioColors.BackgroundCard,
            focusedContainerColor = NuvioColors.FocusBackground
        ),
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(12.dp))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = repository.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = NuvioColors.TextPrimary
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "${repository.scraperCount} providers",
                    style = MaterialTheme.typography.bodySmall,
                    color = NuvioColors.TextSecondary
                )
                Text(
                    text = "Updated: ${formatDate(repository.lastUpdated)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = NuvioColors.TextSecondary
                )
            }
            
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onRefresh,
                    enabled = !isLoading,
                    colors = ButtonDefaults.colors(
                        containerColor = NuvioColors.Surface
                    )
                ) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = "Refresh",
                        tint = NuvioColors.TextSecondary
                    )
                }
                
                Button(
                    onClick = onRemove,
                    enabled = !isLoading,
                    colors = ButtonDefaults.colors(
                        containerColor = NuvioColors.Surface
                    )
                ) {
                    Icon(
                        imageVector = Icons.Default.Delete,
                        contentDescription = "Remove",
                        tint = Color(0xFFE57373)
                    )
                }
            }
        }
    }
}

@Composable
private fun ScraperCard(
    scraper: ScraperInfo,
    onToggle: (Boolean) -> Unit,
    onTest: () -> Unit,
    isTesting: Boolean,
    testResults: List<LocalScraperResult>?
) {
    var showResults by remember { mutableStateOf(false) }
    
    LaunchedEffect(testResults) {
        showResults = testResults != null
    }
    
    // Use Box instead of focusable Surface to allow child focus
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = NuvioColors.BackgroundCard,
                shape = RoundedCornerShape(12.dp)
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = scraper.name,
                            style = MaterialTheme.typography.titleMedium,
                            color = NuvioColors.TextPrimary
                        )
                        
                        // Type badges
                        scraper.supportedTypes.forEach { type ->
                            TypeBadge(type = type)
                        }
                    }
                    
                    Spacer(modifier = Modifier.height(4.dp))
                    
                    Text(
                        text = "Version ${scraper.version}",
                        style = MaterialTheme.typography.bodySmall,
                        color = NuvioColors.TextSecondary
                    )
                }
                
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Test button
                    Button(
                        onClick = onTest,
                        enabled = !isTesting && scraper.enabled,
                        colors = ButtonDefaults.colors(
                            containerColor = NuvioColors.Surface,
                            contentColor = NuvioColors.TextPrimary
                        )
                    ) {
                        if (isTesting) {
                            LoadingIndicator(modifier = Modifier.size(16.dp))
                        } else {
                            Icon(
                                imageVector = Icons.Default.PlayArrow,
                                contentDescription = "Test",
                                modifier = Modifier.size(16.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Test")
                    }
                    
                    // Enable toggle
                    Switch(
                        checked = scraper.enabled,
                        onCheckedChange = onToggle,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = NuvioColors.Secondary,
                            checkedTrackColor = NuvioColors.Secondary.copy(alpha = 0.3f)
                        )
                    )
                }
            }
            
            // Test results
            AnimatedVisibility(visible = showResults && testResults != null) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp)
                ) {
                    Text(
                        text = "Test Results (${testResults?.size ?: 0} streams)",
                        style = MaterialTheme.typography.bodySmall,
                        color = NuvioColors.TextSecondary
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    testResults?.take(3)?.forEach { result ->
                        TestResultItem(result = result)
                        Spacer(modifier = Modifier.height(4.dp))
                    }
                    
                    if ((testResults?.size ?: 0) > 3) {
                        Text(
                            text = "... and ${testResults!!.size - 3} more",
                            style = MaterialTheme.typography.bodySmall,
                            color = NuvioColors.TextSecondary
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TypeBadge(type: String) {
    val color = when (type.lowercase()) {
        "movie" -> Color(0xFF4CAF50)
        "series", "show", "tv" -> Color(0xFF2196F3)
        else -> NuvioColors.TextSecondary
    }
    
    Box(
        modifier = Modifier
            .background(
                color = color.copy(alpha = 0.2f),
                shape = RoundedCornerShape(4.dp)
            )
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text(
            text = type.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = color
        )
    }
}

@Composable
private fun TestResultItem(result: LocalScraperResult) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = NuvioColors.Surface,
                shape = RoundedCornerShape(6.dp)
            )
            .padding(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = result.title,
                    style = MaterialTheme.typography.bodySmall,
                    color = NuvioColors.TextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                result.quality?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.labelSmall,
                        color = NuvioColors.Primary
                    )
                }
            }
            
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = null,
                tint = Color(0xFF4CAF50),
                modifier = Modifier.size(16.dp)
            )
        }
    }
}

@Composable
private fun AddRepositoryDialog(
    url: String,
    onUrlChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    isLoading: Boolean
) {
    val focusRequester = remember { FocusRequester() }
    
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.8f)),
        contentAlignment = Alignment.Center
    ) {
        Surface(
            onClick = { },
            modifier = Modifier
                .width(500.dp)
                .focusRequester(focusRequester),
            colors = ClickableSurfaceDefaults.colors(
                containerColor = NuvioColors.BackgroundCard
            ),
            shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(16.dp))
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Add Repository",
                    style = MaterialTheme.typography.headlineSmall,
                    color = NuvioColors.TextPrimary
                )
                
                Spacer(modifier = Modifier.height(16.dp))
                
                Text(
                    text = "Enter the URL to a manifest.json file",
                    style = MaterialTheme.typography.bodyMedium,
                    color = NuvioColors.TextSecondary
                )
                
                Spacer(modifier = Modifier.height(16.dp))
                
                // Custom text field using BasicTextField
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            color = NuvioColors.Surface,
                            shape = RoundedCornerShape(8.dp)
                        )
                        .border(
                            width = 1.dp,
                            color = NuvioColors.Border,
                            shape = RoundedCornerShape(8.dp)
                        )
                        .padding(16.dp)
                ) {
                    if (url.isEmpty()) {
                        Text(
                            text = "https://example.com/manifest.json",
                            style = TextStyle(
                                color = NuvioColors.TextTertiary,
                                fontSize = 14.sp
                            )
                        )
                    }
                    BasicTextField(
                        value = url,
                        onValueChange = onUrlChange,
                        textStyle = TextStyle(
                            color = NuvioColors.TextPrimary,
                            fontSize = 14.sp
                        ),
                        cursorBrush = SolidColor(NuvioColors.Primary),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Uri,
                            imeAction = ImeAction.Done
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                
                Spacer(modifier = Modifier.height(24.dp))
                
                Row(
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Button(
                        onClick = onDismiss,
                        enabled = !isLoading,
                        colors = ButtonDefaults.colors(
                            containerColor = NuvioColors.Surface,
                            contentColor = NuvioColors.TextPrimary
                        )
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Cancel")
                    }
                    
                    Button(
                        onClick = onConfirm,
                        enabled = !isLoading && url.isNotBlank(),
                        colors = ButtonDefaults.colors(
                            containerColor = NuvioColors.Primary,
                            contentColor = Color.White
                        )
                    ) {
                        if (isLoading) {
                            LoadingIndicator(modifier = Modifier.size(18.dp))
                        } else {
                            Icon(
                                imageVector = Icons.Default.Add,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Add")
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyState(
    message: String,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier.fillMaxWidth(),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = NuvioColors.TextSecondary,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun MessageOverlay(
    successMessage: String?,
    errorMessage: String?
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        contentAlignment = Alignment.BottomCenter
    ) {
        AnimatedVisibility(
            visible = successMessage != null || errorMessage != null,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            val isSuccess = successMessage != null
            val message = successMessage ?: errorMessage ?: ""
            
            Surface(
                onClick = { },
                colors = ClickableSurfaceDefaults.colors(
                    containerColor = if (isSuccess) 
                        Color(0xFF2E7D32).copy(alpha = 0.9f) 
                    else 
                        Color(0xFFC62828).copy(alpha = 0.9f)
                ),
                shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(12.dp))
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(
                        imageVector = if (isSuccess) Icons.Default.Check else Icons.Default.Close,
                        contentDescription = null,
                        tint = Color.White
                    )
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White
                    )
                }
            }
        }
    }
}

private fun formatDate(timestamp: Long): String {
    return SimpleDateFormat("MMM dd, yyyy", Locale.getDefault()).format(Date(timestamp))
}
