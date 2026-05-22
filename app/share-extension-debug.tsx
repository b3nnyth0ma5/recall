import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/utils/supabase';
import { colors } from '@/styles/commonStyles';
import {
  getDiagnostics,
  getAppGroupContainerPath,
  type AppGroupDiagnostics,
} from '@/modules/AppGroupModule';

const APP_GROUP_ID = 'group.com.b3nny1nc.recall';

// ─── helpers ────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

// ─── component ──────────────────────────────────────────────────────────────

export default function ShareExtensionDebugScreen() {
  const [diagnostics, setDiagnostics] = useState<AppGroupDiagnostics | null>(null);
  const [sessionInfo, setSessionInfo] = useState<string>('—');
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const appendLog = useCallback((line: string) => {
    const entry = `[${ts()}] ${line}`;
    console.log('[ShareExtDebug]', line);
    setLog((prev) => [...prev, entry]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  const runDiagnostics = useCallback(async () => {
    appendLog('Running getDiagnostics()…');
    try {
      const result = await getDiagnostics();
      setDiagnostics(result);
      appendLog('getDiagnostics() OK: ' + JSON.stringify(result));
    } catch (e) {
      appendLog('getDiagnostics() THREW: ' + String(e));
    }
  }, [appendLog]);

  const fetchSession = useCallback(async () => {
    appendLog('Fetching supabase session…');
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        const msg = 'getSession error: ' + error.message;
        setSessionInfo(msg);
        appendLog(msg);
        return;
      }
      if (!session) {
        setSessionInfo('No active session');
        appendLog('No active session found');
        return;
      }
      const info = `user_id: ${session.user.id} | expires_at: ${session.expires_at ?? 'n/a'}`;
      setSessionInfo(info);
      appendLog('Session found — ' + info);
    } catch (e) {
      const msg = 'getSession threw: ' + String(e);
      setSessionInfo(msg);
      appendLog(msg);
    }
  }, [appendLog]);

  // Run both on mount
  useEffect(() => {
    runDiagnostics();
    fetchSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = useCallback(async () => {
    console.log('[ShareExtDebug] Refresh button pressed');
    setBusy(true);
    await runDiagnostics();
    await fetchSession();
    setBusy(false);
  }, [runDiagnostics, fetchSession]);

  const handleForceWrite = useCallback(async () => {
    console.log('[ShareExtDebug] Force write token button pressed');
    setBusy(true);
    appendLog('Force-writing token to App Group…');
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        appendLog('No session available — cannot write token: ' + (error?.message ?? 'null session'));
        setBusy(false);
        return;
      }

      const containerPath = await getAppGroupContainerPath();
      appendLog('Container path: ' + (containerPath ?? 'NULL'));

      if (!containerPath) {
        appendLog('ABORT — container path is null');
        setBusy(false);
        return;
      }

      const normalized = containerPath.startsWith('file://')
        ? containerPath
        : `file://${containerPath}`;
      const tokenPath = normalized.endsWith('/')
        ? `${normalized}auth-token.json`
        : `${normalized}/auth-token.json`;

      const payload = JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user_id: session.user.id,
        expires_at: session.expires_at ?? 0,
      });

      appendLog(`Writing ${payload.length} bytes to: ${tokenPath}`);
      await FileSystem.writeAsStringAsync(tokenPath, payload);
      appendLog('Write succeeded!');

      // Re-run diagnostics to confirm
      await runDiagnostics();
    } catch (e) {
      appendLog('Force write FAILED: ' + (e instanceof Error ? e.message : String(e)));
      appendLog('Stack: ' + (e instanceof Error ? (e.stack ?? 'no stack') : 'no stack'));
    }
    setBusy(false);
  }, [appendLog, runDiagnostics]);

  const handleClearToken = useCallback(async () => {
    console.log('[ShareExtDebug] Clear token button pressed');
    setBusy(true);
    appendLog('Clearing token from App Group…');
    try {
      const containerPath = await getAppGroupContainerPath();
      appendLog('Container path: ' + (containerPath ?? 'NULL'));

      if (!containerPath) {
        appendLog('ABORT — container path is null');
        setBusy(false);
        return;
      }

      const normalized = containerPath.startsWith('file://')
        ? containerPath
        : `file://${containerPath}`;
      const tokenPath = normalized.endsWith('/')
        ? `${normalized}auth-token.json`
        : `${normalized}/auth-token.json`;

      appendLog('Deleting: ' + tokenPath);
      await FileSystem.deleteAsync(tokenPath, { idempotent: true });
      appendLog('Delete succeeded!');

      // Re-run diagnostics to confirm
      await runDiagnostics();
    } catch (e) {
      appendLog('Clear token FAILED: ' + (e instanceof Error ? e.message : String(e)));
    }
    setBusy(false);
  }, [appendLog, runDiagnostics]);

  const diagnosticsText = diagnostics ? JSON.stringify(diagnostics, null, 2) : 'Not yet loaded';

  return (
    <>
      <Stack.Screen options={{ title: 'Share Extension Debug' }} />
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {/* ── Session ── */}
        <Text style={styles.sectionTitle}>Supabase Session</Text>
        <View style={styles.card}>
          <Text style={styles.mono}>{sessionInfo}</Text>
        </View>

        {/* ── Diagnostics ── */}
        <Text style={styles.sectionTitle}>App Group Diagnostics</Text>
        <View style={styles.card}>
          <Text style={styles.mono}>{diagnosticsText}</Text>
        </View>

        {/* ── Actions ── */}
        <Text style={styles.sectionTitle}>Actions</Text>
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
            onPress={handleRefresh}
            disabled={busy}
          >
            <Text style={styles.btnText}>Refresh</Text>
          </Pressable>

          <Pressable
            style={[styles.btn, styles.btnSuccess, busy && styles.btnDisabled]}
            onPress={handleForceWrite}
            disabled={busy}
          >
            <Text style={styles.btnText}>Force Write Token</Text>
          </Pressable>

          <Pressable
            style={[styles.btn, styles.btnDanger, busy && styles.btnDisabled]}
            onPress={handleClearToken}
            disabled={busy}
          >
            <Text style={styles.btnText}>Clear App Group Token</Text>
          </Pressable>
        </View>

        {/* ── On-screen log ── */}
        <Text style={styles.sectionTitle}>Log</Text>
        <View style={styles.logBox}>
          {log.length === 0 ? (
            <Text style={styles.logEmpty}>No log entries yet</Text>
          ) : (
            log.map((entry, i) => (
              <Text key={i} style={styles.logEntry}>{entry}</Text>
            ))
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 48,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mono: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: colors.text,
    lineHeight: 18,
  },
  buttonRow: {
    gap: 10,
  },
  btn: {
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: colors.primary,
  },
  btnSuccess: {
    backgroundColor: '#2E7D32',
  },
  btnDanger: {
    backgroundColor: colors.appleRed,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  logBox: {
    backgroundColor: '#0D0D0D',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 120,
  },
  logEmpty: {
    color: colors.textTertiary,
    fontSize: 12,
    fontFamily: 'Courier',
  },
  logEntry: {
    color: '#A8FF78',
    fontSize: 11,
    fontFamily: 'Courier',
    lineHeight: 17,
  },
});
