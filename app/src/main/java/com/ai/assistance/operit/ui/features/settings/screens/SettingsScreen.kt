package com.ai.assistance.operit.ui.features.settings.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.text.style.TextOverflow
import java.text.DecimalFormat
import com.ai.assistance.operit.R
import com.ai.assistance.operit.data.server.AuthPreferences
import com.ai.assistance.operit.data.server.ChisaTalkAuthState
import com.ai.assistance.operit.data.server.ChisaTalkApiClient
import com.ai.assistance.operit.data.preferences.UserPreferencesManager
import com.ai.assistance.operit.util.AppLogger
import kotlinx.coroutines.launch
import androidx.compose.ui.graphics.Color

// 保存滑动状态变量，使其跨重组保持
private val SettingsScreenScrollPosition = mutableStateOf(0)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
        onNavigateToUserPreferences: () -> Unit,
        navigateToGitHubAccount: () -> Unit,
        navigateToToolPermissions: () -> Unit,
        navigateToModelConfig: () -> Unit,
        navigateToThemeSettings: () -> Unit,
        navigateToGlobalDisplaySettings: () -> Unit,
        navigateToModelPrompts: () -> Unit,
        navigateToFunctionalConfig: () -> Unit,
        navigateToChatHistorySettings: () -> Unit,
        navigateToChatBackupSettings: () -> Unit,
        navigateToLanguageSettings: () -> Unit,
        navigateToSpeechServicesSettings: () -> Unit,
        navigateToExternalHttpChatSettings: () -> Unit,
        navigateToPersonaCardGeneration: () -> Unit,
        navigateToWaifuModeSettings: () -> Unit,
        navigateToTokenUsageStatistics: () -> Unit,
        navigateToContextSummarySettings: () -> Unit,
        navigateToLayoutAdjustmentSettings: () -> Unit
) {
        val context = LocalContext.current
        val userPreferences = remember { UserPreferencesManager.getInstance(context) }
        val authPreferences = remember { AuthPreferences.getInstance(context) }
        val chisaTalkApiClient = remember { ChisaTalkApiClient.getInstance(context) }
        val scope = rememberCoroutineScope()
        val authState = authPreferences.authStateFlow.collectAsState(initial = ChisaTalkAuthState()).value

        // 创建和记住滚动状态，设置为上次保存的位置
        val scrollState = rememberScrollState(SettingsScreenScrollPosition.value)

        // 当滚动状态改变时更新保存的位置
        LaunchedEffect(scrollState) {
                snapshotFlow { scrollState.value }.collect { position ->
                        SettingsScreenScrollPosition.value = position
                }
        }

        val hasBackgroundImage = userPreferences.useBackgroundImage.collectAsState(initial = false).value
        
        val cardContainerColor = if (hasBackgroundImage) {
                MaterialTheme.colorScheme.surface
        } else {
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
        }

        Column(
                modifier = Modifier.fillMaxSize()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .verticalScroll(scrollState)
        ) {
                // ======= 账号 =======
                SettingsSection(
                        title = stringResource(id = R.string.settings_section_account),
                        icon = Icons.Default.AccountCircle,
                        containerColor = cardContainerColor
                ) {
                        CompactSettingsItem(
                                title = "ChisaTalk 账号",
                                subtitle = authState.user?.displayName ?: authState.user?.username ?: "已登录",
                                icon = Icons.Default.Person,
                                onClick = {}
                        )

                        CompactSettingsItem(
                                title = stringResource(R.string.logout),
                                subtitle = "退出当前 ChisaTalk 账号",
                                icon = Icons.Default.Logout,
                                onClick = {
                                        scope.launch {
                                                try {
                                                        val token = authPreferences.currentState().accessToken
                                                        if (token.isNotBlank()) {
                                                                chisaTalkApiClient.logout(token)
                                                        }
                                                } catch (e: Exception) {
                                                        AppLogger.e("SettingsScreen", "退出登录请求失败", e)
                                                } finally {
                                                        authPreferences.logout()
                                                }
                                        }
                                }
                        )
                }

                // ======= 个性化配置 =======
                SettingsSection(
                        title = stringResource(id = R.string.settings_section_personalization),
                        icon = Icons.Default.Person,
                        containerColor = cardContainerColor
                ) {
                        CompactSettingsItem(
                                title = stringResource(id = R.string.settings_user_preferences),
                                subtitle = stringResource(id = R.string.settings_user_preferences_subtitle),
                                icon = Icons.Default.Face,
                                onClick = onNavigateToUserPreferences
                        )
                        
                        CompactSettingsItem(
                                title = stringResource(R.string.language_settings),
                                subtitle = stringResource(id = R.string.settings_language_subtitle),
                                icon = Icons.Default.Language,
                                onClick = navigateToLanguageSettings
                        )
                        
                        CompactSettingsItem(
                                title = stringResource(id = R.string.settings_theme_appearance),
                                subtitle = stringResource(id = R.string.settings_theme_subtitle),
                                icon = Icons.Default.Palette,
                                onClick = navigateToThemeSettings
                        )
                        
                        CompactSettingsItem(
                                title = stringResource(R.string.settings_global_display),
                                subtitle = stringResource(R.string.settings_global_display_subtitle),
                                icon = Icons.Default.Visibility,
                                onClick = navigateToGlobalDisplaySettings
                        )
                        
                        CompactSettingsItem(
                                title = stringResource(R.string.layout_adjustment),
                                subtitle = stringResource(R.string.layout_adjustment_subtitle),
                                icon = Icons.Default.AspectRatio,
                                onClick = navigateToLayoutAdjustmentSettings
                        )
                }

                // ======= 数据 =======
                SettingsSection(
                        title = stringResource(id = R.string.settings_data_permissions),
                        icon = Icons.Default.Security,
                        containerColor = cardContainerColor
                ) {
                        CompactSettingsItem(
                                title = stringResource(id = R.string.settings_data_backup),
                                subtitle = stringResource(id = R.string.settings_data_backup_desc),
                                icon = Icons.Default.CloudUpload,
                                onClick = navigateToChatBackupSettings
                        )
                        
                        CompactSettingsItem(
                                title = stringResource(id = R.string.settings_chat_history_management),
                                subtitle = stringResource(id = R.string.settings_chat_history_management_subtitle),
                                icon = Icons.Default.ManageHistory,
                                onClick = navigateToChatHistorySettings
                        )
                }

                // 底部间距
                Spacer(modifier = Modifier.height(16.dp))
        }
}

@Composable
private fun SettingsSection(
        title: String,
        icon: ImageVector,
        containerColor: Color,
        content: @Composable ColumnScope.() -> Unit
) {
        Column(modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                // 分组标题
                Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(vertical = 6.dp)
                ) {
                        Icon(
                                imageVector = icon,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                                text = title,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                        )
                }
                
                // 内容区域
                Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                                containerColor = containerColor
                        )
                ) {
                        Column(
                                modifier = Modifier.padding(12.dp),
                                content = content
                        )
                }
        }
}

@Composable
private fun CompactSettingsItem(
        title: String,
        subtitle: String,
        icon: ImageVector,
        onClick: () -> Unit
) {
        Row(
                modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(6.dp))
                        .clickable { onClick() }
                        .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically
        ) {
                Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp)
                )
                
                Spacer(modifier = Modifier.width(12.dp))
                
                Column(modifier = Modifier.weight(1f)) {
                        Text(
                                text = title,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Medium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                        )
                        Text(
                                text = subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                        )
                }
                
                Icon(
                        imageVector = Icons.Default.ChevronRight,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(16.dp)
                )
        }
}

@Composable
private fun CompactToggleWithDescription(
        title: String,
        description: String,
        checked: Boolean,
        onCheckedChange: (Boolean) -> Unit
) {
        Row(
                modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
        ) {
                Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
                        Text(
                                text = title,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Medium
                        )
                        Text(
                                text = description,
                                style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                        )
                }
                Switch(
                        checked = checked,
                        onCheckedChange = onCheckedChange,
                        modifier = Modifier.scale(0.8f)
                )
        }
}

@Composable
private fun CompactSlider(
        title: String,
        subtitle: String,
        value: Float,
        onValueChange: (Float) -> Unit,
        valueRange: ClosedFloatingPointRange<Float>,
        steps: Int,
        decimalFormatPattern: String,
        unitText: String? = null,
        backgroundColor: Color
) {
        val focusManager = LocalFocusManager.current
        val df = remember(decimalFormatPattern) { DecimalFormat(decimalFormatPattern) }

        var sliderValue by remember(value) { mutableStateOf(value) }
        var textValue by remember(value) { mutableStateOf(df.format(value)) }

        Column(
                modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 4.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(backgroundColor)
                        .padding(8.dp)
        ) {
                Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                ) {
                        Column(modifier = Modifier.weight(1f)) {
                                Text(
                                        text = title,
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.Medium
                                )
                                Text(
                                        text = subtitle,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        fontSize = 10.sp
                                )
                        }

                        Row(verticalAlignment = Alignment.CenterVertically) {
                                BasicTextField(
                                        value = textValue,
                                        onValueChange = { newText ->
                                                textValue = newText
                                                newText.toFloatOrNull()?.let {
                                                        sliderValue = it.coerceIn(valueRange)
                                                }
                                        },
                                        modifier = Modifier
                                                .width(40.dp)
                                                .background(
                                                        MaterialTheme.colorScheme.surfaceVariant,
                                                        RoundedCornerShape(4.dp)
                                                )
                                                .padding(horizontal = 4.dp, vertical = 2.dp),
                                        textStyle = TextStyle(
                                                color = MaterialTheme.colorScheme.primary,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 11.sp,
                                                textAlign = TextAlign.Center
                                        ),
                                        keyboardOptions = KeyboardOptions(
                                                keyboardType = KeyboardType.Number,
                                                imeAction = ImeAction.Done
                                        ),
                                        keyboardActions = KeyboardActions(
                                                onDone = {
                                                        val finalValue = textValue.toFloatOrNull()?.coerceIn(valueRange) ?: sliderValue
                                                        onValueChange(finalValue)
                                                        textValue = df.format(finalValue)
                                                        focusManager.clearFocus()
                                                }
                                        ),
                                        singleLine = true
                                )

                                if (unitText != null) {
                                        Text(
                                                text = unitText,
                                                style = MaterialTheme.typography.bodySmall.copy(
                                                        color = MaterialTheme.colorScheme.primary,
                                                        fontWeight = FontWeight.Bold,
                                                        fontSize = 10.sp
                                                ),
                                                modifier = Modifier.padding(start = 2.dp)
                                        )
                                }
                        }
                }
        }
}


