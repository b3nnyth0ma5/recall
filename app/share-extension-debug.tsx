import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { supabase } from '@/utils/supabase';
import { colors } from '@/styles/commonStyles';
import {
  getDiagnostics,
  getAppGroupContainerPath,
  verifyAppGroupContainer,
  readLastShareExtensionError,
  clearLastShareExtensionError,
  type AppGroupDiagnostics,
} from '@/modules/AppGroupModule';
import { writeTokenToAppGroup } from '@/contexts/AuthContext';
import * as FileSystem from 'expo-file-system/legacy';

const APP_GROUP_ID = 'group.com.b3nny1nc.recall';

// ─── helpers ────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 23);
}

function relativeTime(epochSeconds: number): string {
  const diffMs = Date.now() - epochSeconds * 1000;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec} seconds ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
}

// ─── component ──────────────────────────────────────────────────────────────

export default function ShareExtensionDebugScreen() {
  const [diagnostics, setDiagnostics] = useState<AppGroupDiagnostics | null>(null);
  const [sessionInfo, setSessionInfo] = useState<string>('—');
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Section A — last share extension error
  const [lastError, setLastError] = useState<Record<string, any> | null | undefined>(undefined);
  const [errorBusy, setErrorBusy] = useState(false);

  // Section B — round-trip test result
  const [roundTripResult, setRoundTripResult] = useState<string | null>(null);
  const [roundTripPass, setRoundTripPass] = useState<boolean | null>(null);
  const [roundTripBusy, setRoundTripBusy] = useState(false);

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

  const fetchLastError = useCallback(async () => {
    console.log('[ShareExtDebug] fetchLastError called');
    setErrorBusy(true);
    try {
      const result = await readLastShareExtensionError();
      setLastError(result);
      appendLog('readLastShareExtensionError: ' + (result ? JSON.stringify(result) : 'null'));
    } catch (e) {
      appendLog('readLastShareExtensionError THREW: ' + String(e));
      setLastError(null);
    }
    setErrorBusy(false);
  }, [appendLog]);

  const handleClearError = useCallback(async () => {
    console.log('[ShareExtDebug] Clear last error button pressed');
    setErrorBusy(true);
    try {
      const ok = await clearLastShareExtensionError();
      appendLog('clearLastShareExtensionError: ' + (ok ? 'cleared' : 'nothing to clear'));
      setLastError(null);
    } catch (e) {
      appendLog('clearLastShareExtensionError THREW: ' + String(e));
    }
    setErrorBusy(false);
  }, [appendLog]);

  // Run all on mount
  useEffect(() => {
    runDiagnostics();
    fetchSession();
    fetchLastError();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = useCallback(async () => {
    console.log('[ShareExtDebug] Refresh button pressed');
    setBusy(true);
    await runDiagnostics();
    await fetchSession();
    await fetchLastError();
    setBusy(false);
  }, [runDiagnostics, fetchSession, fetchLastError]);

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

  // Section B — end-to-end round-trip test
  const handleRoundTripTest = useCallback(async () => {
    console.log('[ShareExtDebug] Run end-to-end token test button pressed');
    setRoundTripBusy(true);
    setRoundTripResult(null);
    setRoundTripPass(null);
    appendLog('Starting end-to-end token round-trip test…');

    try {
      // Step 1: get session
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        const msg = 'No active session — sign in first';
        appendLog('Round-trip ABORTED: ' + msg);
        setRoundTripResult(msg);
        setRoundTripPass(false);
        setRoundTripBusy(false);
        return;
      }
      appendLog('Session OK — userId: ' + session.user.id);

      // Step 2: write token via AuthContext's exported function
      appendLog('Calling writeTokenToAppGroup…');
      await writeTokenToAppGroup(session);
      appendLog('writeTokenToAppGroup returned');

      // Step 3: verify via native module
      appendLog('Calling verifyAppGroupContainer…');
      const verify = await verifyAppGroupContainer();
      appendLog('verifyAppGroupContainer result: ' + JSON.stringify(verify));

      if (!verify) {
        const msg = 'FAIL — verifyAppGroupContainer returned null (native module unavailable or not iOS)';
        appendLog(msg);
        setRoundTripResult(msg);
        setRoundTripPass(false);
        setRoundTripBusy(false);
        return;
      }

      if (!verify.containerExists) {
        const msg = `FAIL — Stage 1: App Group container does not exist at ${verify.containerPath}. Hint: entitlements mismatch or app not installed with correct provisioning.`;
        appendLog(msg);
        setRoundTripResult(msg);
        setRoundTripPass(false);
        setRoundTripBusy(false);
        return;
      }

      if (!verify.tokenFileExists) {
        const msg = `FAIL — Stage 2: auth-token.json not found after write. Container path seen by JS: ${verify.containerPath}. Hint: JS writes to a different path than Swift reads.`;
        appendLog(msg);
        setRoundTripResult(msg);
        setRoundTripPass(false);
        setRoundTripBusy(false);
        return;
      }

      const expectedPayload = JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user_id: session.user.id,
        expires_at: session.expires_at ?? 0,
      });

      if (verify.tokenFileSize !== expectedPayload.length) {
        const msg = `FAIL — Stage 3: size mismatch. Wrote ${expectedPayload.length} bytes, Swift sees ${verify.tokenFileSize} bytes. Hint: encoding difference or partial write.`;
        appendLog(msg);
        setRoundTripResult(msg);
        setRoundTripPass(false);
        setRoundTripBusy(false);
        return;
      }

      const msg = `PASS — token file exists (${verify.tokenFileSize} bytes), size matches. Container: ${verify.containerPath}`;
      appendLog(msg);
      setRoundTripResult(msg);
      setRoundTripPass(true);
    } catch (e) {
      const msg = 'Round-trip test THREW: ' + (e instanceof Error ? e.message : String(e));
      appendLog(msg);
      setRoundTripResult(msg);
      setRoundTripPass(false);
    }

    setRoundTripBusy(false);
  }, [appendLog]);

  const diagnosticsText = diagnostics ? JSON.stringify(diagnostics, null, 2) : 'Not yet loaded';

  // Derive last error display values
  const lastErrorStage = lastError?.stage ?? null;
  const lastErrorTimestamp = typeof lastError?.timestamp === 'number' ? lastError.timestamp : null;
  const lastErrorRelTime = lastErrorTimestamp ? relativeTime(lastErrorTimestamp) : null;
  const lastErrorOtherFields = lastError
    ? Object.entries(lastError).filter(([k]) => k !== 'stage' && k !== 'timestamp' && k !== 'appGroupID')
    : [];
  const lastErrorOtherText = lastErrorOtherFields.length > 0
    ? lastErrorOtherFields.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')
    : null;

  const roundTripColor = roundTripPass === true ? '#4CAF50' : roundTripPass === false ? colors.appleRed : colors.textSecondary;

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

        {/* ── Section A: Last Share Extension Error ── */}
        <Text style={styles.sectionTitle}>Last Share Extension Error</Text>
        <View style={styles.card}>
          {lastError === undefined ? (
            <Text style={styles.mono}>Loading…</Text>
          ) : lastError === null ? (
            <Text style={[styles.mono, { color: colors.textSecondary }]}>
              No share extension errors recorded — last share either succeeded or hasn't run since install.
            </Text>
          ) : (
            <>
              <View style={styles.errorRow}>
                <Text style={styles.errorLabel}>Stage</Text>
                <Text style={[styles.mono, styles.errorValue]}>{lastErrorStage ?? '—'}</Text>
              </View>
              {lastErrorRelTime !== null && (
                <View style={styles.errorRow}>
                  <Text style={styles.errorLabel}>When</Text>
                  <Text style={[styles.mono, styles.errorValue]}>{lastErrorRelTime}</Text>
                </View>
              )}
              {lastErrorOtherText !== null && (
                <View style={[styles.monoBlock, { marginTop: 8 }]}>
                  <Text style={styles.mono}>{lastErrorOtherText}</Text>
                </View>
              )}
            </>
          )}
        </View>
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.btn, styles.btnPrimary, errorBusy && styles.btnDisabled]}
            onPress={fetchLastError}
            disabled={errorBusy}
          >
            <Text style={styles.btnText}>Refresh Error</Text>
          </Pressable>
          {lastError !== null && lastError !== undefined && (
            <Pressable
              style={[styles.btn, styles.btnDanger, errorBusy && styles.btnDisabled]}
              onPress={handleClearError}
              disabled={errorBusy}
            >
              <Text style={styles.btnText}>Clear Last Error</Text>
            </Pressable>
          )}
        </View>

        {/* ── Section B: Round-Trip Test ── */}
        <Text style={styles.sectionTitle}>Run Round-Trip Test</Text>
        <Pressable
          style={[styles.btn, styles.btnSuccess, roundTripBusy && styles.btnDisabled]}
          onPress={handleRoundTripTest}
          disabled={roundTripBusy}
        >
          <Text style={styles.btnText}>
            {roundTripBusy ? 'Running…' : 'Run end-to-end token test'}
          </Text>
        </Pressable>
        {roundTripResult !== null && (
          <View style={[styles.card, { borderColor: roundTripColor }]}>
            <Text style={[styles.mono, { color: roundTripColor }]}>{roundTripResult}</Text>
          </View>
        )}

        {/* ── Actions ── */}
        <Text style={styles.sectionTitle}>Actions</Text>
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
            onPress={handleRefresh}
            disabled={busy}
          >
            <Text style={styles.btnText}>Refresh All</Text>
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
  monoBlock: {
    backgroundColor: '#0D0D0D',
    borderRadius: 6,
    padding: 8,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 8,
  },
  errorLabel: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: colors.textSecondary,
    width: 52,
    lineHeight: 18,
  },
  errorValue: {
    flex: 1,
    color: colors.text,
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
