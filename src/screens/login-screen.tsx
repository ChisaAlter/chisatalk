import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { LogIn } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { CHISATALK_API_BASE_URL } from "@/api/chisatalk-client";

interface LoginScreenProps {
  errorMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (input: { username: string; password: string }) => Promise<void>;
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  keyboard: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[12],
    paddingBottom: theme.spacing[8],
    gap: theme.spacing[8],
  },
  brand: {
    gap: theme.spacing[4],
  },
  brandTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  mark: {
    width: 52,
    height: 52,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.foreground,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadow.md,
  },
  markText: {
    color: theme.colors.accentForeground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
    includeFontPadding: false,
  },
  badge: {
    minHeight: 34,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[3],
  },
  badgeText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
  },
  headingGroup: {
    gap: theme.spacing[2],
  },
  appName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize["4xl"],
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 0,
    includeFontPadding: false,
  },
  subtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.lg,
    lineHeight: 26,
  },
  serverText: {
    color: theme.colors.foregroundSubtle,
    fontSize: theme.fontSize.xs,
  },
  form: {
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[4],
    gap: theme.spacing[4],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderStrong,
    ...theme.shadow.lg,
  },
  field: {
    gap: theme.spacing[2],
  },
  label: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  input: {
    minHeight: 52,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    paddingHorizontal: theme.spacing[4],
    paddingTop: 0,
    paddingBottom: 0,
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  submitButton: {
    minHeight: 52,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
    backgroundColor: theme.colors.accent,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.accent,
    ...theme.shadow.sm,
  },
  submitButtonDisabled: {
    opacity: theme.opacity[50],
  },
  submitText: {
    color: theme.colors.accentForeground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
    includeFontPadding: false,
  },
}));

export function LoginScreen({ errorMessage, isSubmitting, onSubmit }: LoginScreenProps) {
  const { theme } = useUnistyles();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const canSubmit = username.trim().length > 0 && password.length > 0 && !isSubmitting;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) {
      return;
    }
    void onSubmit({ username: username.trim(), password });
  }, [canSubmit, onSubmit, password, username]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar
        barStyle={theme.colorScheme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={theme.colors.surface0}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboard}
      >
        <View style={styles.content}>
          <View style={styles.brand}>
            <View style={styles.brandTopRow}>
              <View style={styles.mark}>
                <Text style={styles.markText}>CT</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>PRIVATE AI CONSOLE</Text>
              </View>
            </View>
            <View style={styles.headingGroup}>
              <Text style={styles.appName}>ChisaTalk</Text>
              <Text style={styles.subtitle}>安静、直接、可持续使用的 AI 对话入口。</Text>
            </View>
            <Text style={styles.serverText}>{CHISATALK_API_BASE_URL}</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>账号</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isSubmitting}
                onChangeText={setUsername}
                placeholder="请输入账号"
                placeholderTextColor={theme.colors.foregroundMuted}
                returnKeyType="next"
                style={styles.input}
                value={username}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>密码</Text>
              <TextInput
                editable={!isSubmitting}
                onChangeText={setPassword}
                onSubmitEditing={handleSubmit}
                placeholder="请输入密码"
                placeholderTextColor={theme.colors.foregroundMuted}
                returnKeyType="done"
                secureTextEntry
                style={styles.input}
                value={password}
              />
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
              disabled={!canSubmit}
              onPress={handleSubmit}
              style={[styles.submitButton, !canSubmit ? styles.submitButtonDisabled : null]}
            >
              <LogIn size={18} color={theme.colors.accentForeground} />
              <Text style={styles.submitText}>{isSubmitting ? "登录中" : "登录"}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
