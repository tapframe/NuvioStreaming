package com.nuvio.app.features.library

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.BasicAlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.nuvio
import com.nuvio.app.features.tracking.LibraryListPrivacy
import com.nuvio.app.features.tracking.TrackingLibraryTab
import com.nuvio.app.features.tracking.TrackingLibraryTabKind
import com.nuvio.app.features.tracking.TrackingListManagementCapabilities
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LibraryListManagementDialog(
    state: LibraryListDialogState,
    tabs: List<TrackingLibraryTab>,
    capabilities: TrackingListManagementCapabilities,
    onCreate: () -> Unit,
    onEdit: (TrackingLibraryTab) -> Unit,
    onDelete: (TrackingLibraryTab) -> Unit,
    onNameChange: (String) -> Unit,
    onDescriptionChange: (String) -> Unit,
    onPrivacyChange: (LibraryListPrivacy) -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit,
    onDismiss: () -> Unit,
    errorMessage: String? = null,
) {
    val tokens = MaterialTheme.nuvio
    val personal = tabs.filter { it.kind == TrackingLibraryTabKind.PERSONAL }
    BasicAlertDialog(onDismissRequest = onDismiss) {
        Surface(shape = tokens.shapes.dialog, color = tokens.colors.surfaceDialog) {
            Column(Modifier.fillMaxWidth().padding(tokens.spacing.dialogPadding), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(when (state.mode) {
                    LibraryListDialogMode.MANAGE -> Res.string.library_manage_lists
                    LibraryListDialogMode.DELETE -> Res.string.library_list_delete
                    LibraryListDialogMode.EDIT -> if (state.key == null) Res.string.library_create_list else Res.string.library_edit_list
                }), style = MaterialTheme.typography.titleLarge)
                when (state.mode) {
                    LibraryListDialogMode.MANAGE -> {
                        if (personal.isEmpty()) Text(stringResource(Res.string.library_lists_empty))
                        LazyColumn(Modifier.heightIn(max = 360.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(personal, key = { it.key }) { tab ->
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                    TextButton(onClick = { onEdit(tab) }, modifier = Modifier.weight(1f)) { Text(tab.title) }
                                    TextButton(onClick = { onDelete(tab) }) { Text(stringResource(Res.string.library_list_delete_action)) }
                                }
                            }
                        }
                        Button(onClick = onCreate, modifier = Modifier.fillMaxWidth()) { Text(stringResource(Res.string.library_create_list_action)) }
                    }
                    LibraryListDialogMode.EDIT -> {
                        OutlinedTextField(value = state.name, onValueChange = onNameChange, label = { Text(stringResource(Res.string.library_list_name)) },
                            singleLine = true, enabled = !state.isPending, modifier = Modifier.fillMaxWidth())
                        if (capabilities.supportsDescription) OutlinedTextField(value = state.description, onValueChange = onDescriptionChange,
                            label = { Text(stringResource(Res.string.library_list_description)) }, enabled = !state.isPending, modifier = Modifier.fillMaxWidth())
                        Text(stringResource(Res.string.library_list_privacy), style = MaterialTheme.typography.labelLarge)
                        capabilities.privacyOptions.forEach { privacy ->
                            Row(Modifier.fillMaxWidth().clickable(enabled = !state.isPending) { onPrivacyChange(privacy) }, verticalAlignment = Alignment.CenterVertically) {
                                RadioButton(selected = state.privacy == privacy, onClick = { onPrivacyChange(privacy) }, enabled = !state.isPending)
                                Text(stringResource(when (privacy) {
                                    LibraryListPrivacy.PRIVATE -> Res.string.library_list_private
                                    LibraryListPrivacy.PUBLIC -> Res.string.library_list_public
                                    LibraryListPrivacy.LINK -> Res.string.library_list_link
                                    LibraryListPrivacy.FRIENDS -> Res.string.library_list_friends
                                }))
                            }
                        }
                    }
                    LibraryListDialogMode.DELETE -> Text(stringResource(Res.string.library_list_delete_message, state.name))
                }
                state.error?.let { Text(errorMessage ?: stringResource(if (state.mode == LibraryListDialogMode.DELETE)
                    Res.string.library_list_delete_failed else Res.string.library_list_save_failed), color = tokens.colors.danger) }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = if (state.mode == LibraryListDialogMode.MANAGE) onDismiss else onBack, enabled = !state.isPending) {
                        Text(stringResource(if (state.mode == LibraryListDialogMode.MANAGE) Res.string.action_close else Res.string.action_cancel))
                    }
                    if (state.mode != LibraryListDialogMode.MANAGE) Button(onClick = onSubmit,
                        enabled = !state.isPending && (state.mode == LibraryListDialogMode.DELETE || state.name.isNotBlank())) {
                        Text(stringResource(when { state.isPending -> Res.string.action_saving; state.mode == LibraryListDialogMode.DELETE -> Res.string.library_list_delete_action; else -> Res.string.action_save }))
                    }
                }
            }
        }
    }
}
