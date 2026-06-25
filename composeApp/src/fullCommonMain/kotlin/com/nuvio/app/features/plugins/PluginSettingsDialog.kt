package com.nuvio.app.features.plugins

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowDropDown
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.nuvio.app.core.ui.NuvioInputField
import com.nuvio.app.core.ui.NuvioPrimaryButton
import kotlinx.serialization.json.*

@Composable
fun PluginSettingsDialog(
    scraperId: String,
    scraperName: String,
    layoutJson: String,
    onDismiss: () -> Unit
) {
    val json = remember { Json { ignoreUnknownKeys = true } }
    val layout = remember(layoutJson) {
        runCatching { json.parseToJsonElement(layoutJson).jsonArray }.getOrElse { JsonArray(emptyList()) }
    }

    val savedSettingsJson = remember(scraperId) { PluginStorage.loadScraperSettings(scraperId) ?: "{}" }
    val initialSettings = remember(savedSettingsJson) {
        runCatching { json.parseToJsonElement(savedSettingsJson).jsonObject }.getOrElse { JsonObject(emptyMap()) }
    }

    val currentSettings = remember { mutableStateMapOf<String, JsonElement>().apply { putAll(initialSettings) } }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            shape = MaterialTheme.shapes.large,
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "$scraperName Settings",
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.primary
                )

                layout.forEach { element ->
                    val field = element.jsonObject
                    val type = field["type"]?.jsonPrimitive?.content ?: "info"
                    val key = field["key"]?.jsonPrimitive?.content ?: ""
                    val label = field["label"]?.jsonPrimitive?.content ?: ""
                    val description = field["description"]?.jsonPrimitive?.content

                    when (type) {
                        "header" -> {
                            Text(
                                text = label,
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.secondary,
                                modifier = Modifier.padding(top = 8.dp)
                            )
                        }
                        "info" -> {
                            Text(
                                text = label,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        "text" -> {
                            val value = currentSettings[key]?.jsonPrimitive?.content ?: ""
                            val isPassword = field["isPassword"]?.jsonPrimitive?.boolean ?: false
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(text = label, style = MaterialTheme.typography.labelLarge)
                                NuvioInputField(
                                    value = value,
                                    onValueChange = { currentSettings[key] = JsonPrimitive(it) },
                                    placeholder = field["placeholder"]?.jsonPrimitive?.content ?: ""
                                )
                                description?.let {
                                    Text(
                                        text = it,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                        "select" -> {
                            val options = field["options"]?.jsonArray ?: JsonArray(emptyList())
                            val defaultValue = field["defaultValue"]?.jsonPrimitive?.content ?: ""
                            val currentValue = currentSettings[key]?.jsonPrimitive?.content ?: defaultValue
                            
                            var expanded by remember { mutableStateOf(false) }

                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(text = label, style = MaterialTheme.typography.labelLarge)
                                Box {
                                    OutlinedButton(
                                        onClick = { expanded = true },
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(14.dp),
                                        contentPadding = PaddingValues(16.dp)
                                    ) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            val selectedLabel = options.find { 
                                                it.jsonObject["value"]?.jsonPrimitive?.content == currentValue 
                                            }?.jsonObject?.get("label")?.jsonPrimitive?.content ?: currentValue
                                            
                                            Text(text = selectedLabel.ifBlank { "Select option" })
                                            Icon(Icons.Rounded.ArrowDropDown, contentDescription = null)
                                        }
                                    }
                                    DropdownMenu(
                                        expanded = expanded,
                                        onDismissRequest = { expanded = false },
                                        modifier = Modifier.fillMaxWidth(0.8f)
                                    ) {
                                        options.forEach { optionElement ->
                                            val option = optionElement.jsonObject
                                            val optionLabel = option["label"]?.jsonPrimitive?.content ?: ""
                                            val optionValue = option["value"]?.jsonPrimitive?.content ?: ""
                                            DropdownMenuItem(
                                                text = { Text(optionLabel) },
                                                onClick = {
                                                    currentSettings[key] = JsonPrimitive(optionValue)
                                                    expanded = false
                                                }
                                            )
                                        }
                                    }
                                }
                                description?.let {
                                    Text(
                                        text = it,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                        "toggle" -> {
                            val value = currentSettings[key]?.jsonPrimitive?.boolean ?: field["defaultValue"]?.jsonPrimitive?.boolean ?: false
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(text = label, style = MaterialTheme.typography.bodyLarge)
                                    description?.let {
                                        Text(
                                            text = it,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                                Switch(
                                    checked = value,
                                    onCheckedChange = { currentSettings[key] = JsonPrimitive(it) }
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End)
                ) {
                    TextButton(onClick = onDismiss) {
                        Text("Cancel")
                    }
                    NuvioPrimaryButton(
                        text = "Save",
                        onClick = {
                            val result = JsonObject(currentSettings.toMap())
                            PluginStorage.saveScraperSettings(scraperId, result.toString())
                            onDismiss()
                        },
                        modifier = Modifier.width(100.dp)
                    )
                }
            }
        }
    }
}
