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
  verifyAppGroupContainer,
  readLastShareExtensionError,
  clearLastShareExtensionError,
  verifyKeychainItem,
  writeTokenFile,
  deleteTokenFile,
  type AppGroupDiagnostics,
} from '@/modules/recall-native';
import { writeTokenToAppGroup } from '@/contexts/AuthContext';

const APP_GROUP_ID = 'group.com.b3nny1nc.recall';
const KEYCHAIN_ACCESS_GROUP = '9PWN6F3TK8.com.b3nny1nc.recall';

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

function expiryDisplay(expiresAt: number): { text: string; expired: boolean } {
  const remaining = expiresAt - Date.now() / 1000;
  if (remaining <= 0) return { text: 'EXPIRED', expired: true };
  const mins = Math.floor(remaining / 60);
  if (mins < 60) return { text: `${mins} min remaining`, expired: false };
  const hrs = Math.floor(mins / 60);
  return { text: `${hrs}h ${mins % 60}m remaining`, expired: false };
}

// ─── sub-components ─────────────────────────────────────────────────────────

function StatusRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  const indicator = ok ? '✓' : '✗';
  const indicatorColor = ok ? '#4CAF50' : colors.appleRed;
  return (
    <View style={rowStyles.row}>
      <Text style={[rowStyles.indicator, { color: indicatorColor }]}>{indicator}</Text>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.infoLabel}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 6,
  },
  indicator: {
    fontFamily: 'Courier',
    fontSize: 13,
    fontWeight: '700',
    width: 16,
    lineHeight: 18,
  },
  label: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: colors.textSecondary,
    width: 130,
    lineHeight: 18,
  },
  infoLabel: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: colors.textSecondary,
    width: 146,
    lineHeight: 18,
  },
  value: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: colors.text,
    flex: 1,
    lineHeight: 18,
  },
});

// ─── main component ──────────────────────────────────────────────────────────

interface DiagState {
  appGroup: AppGroupDiagnostics | null;
  keychain: { present: boolean; dataSize: number } | null;
  tokenExpiresAt: number | null;
}

export default function ShareExtensionDebugScreen() {
  const [diag, setDiag] = useState<DiagState>({ appGroup: null, keychain: null, tokenExpiresAt: null });
  const [sessionInfo, setSessionInfo] = useState<string>('—');
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const [lastError, setLastError] = useState<Record<string, any> | null | undefined>(undefined);
  const [errorBusy, setErrorBusy] = useState(false);

  const [roundTripResult, setRoundTripResult] = useState<string | null>(null);
  const [roundTripPass, setRoundTripPass] = useState<boolean | null>(null);
  const [roundTripBusy, setRoundTripBusy] = useState(false);
  const [roundTripSteps, setRoundTripSteps] = useState<{ label: string; pass: boolean; detail?: string }[]>([]);

  const appendLog = useCallback((line: string) => {
    const entry = `[${ts()}] ${line}`;
    console.log('[ShareExtDebug]', line);
    setLog((prev) => [...prev, entry]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  const runDiagnostics = useCallback(async () => {
    appendLog('Running diagnostics…');
    try {
      const [appGroup, keychain] = await Promise.all([
        getDiagnostics(),
        verifyKeychainItem(),
      ]);
      appendLog('getDiagnostics OK: ' + JSON.stringify(appGroup));
      appendLog('verifyKeychainItem OK: ' + JSON.stringify(keychain));

      // Try to read token expiry from App Group file
      let tokenExpiresAt: number | null = null;
      if (appGroup?.tokenFileExists && appGroup?.containerPath) {
        // We can't read the file directly from JS, but we can infer from session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.expires_at) {
          tokenExpiresAt = session.expires_at;
        }
      }

      setDiag({ appGroup, keychain, tokenExpiresAt });
    } catch (e) {
      appendLog('Diagnostics THREW: ' + String(e));
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
    appendLog('Force-writing token to App Group + Keychain…');
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        appendLog('No session available — cannot write token: ' + (error?.message ?? 'null session'));
        setBusy(false);
        return;
      }
      appendLog('Session OK — calling writeTokenToAppGroup…');
      await writeTokenToAppGroup(session);
      appendLog('writeTokenToAppGroup returned');
      await runDiagnostics();
    } catch (e) {
      appendLog('Force write FAILED: ' + (e instanceof Error ? e.message : String(e)));
    }
    setBusy(false);
  }, [appendLog, runDiagnostics]);

  const handleClearToken = useCallback(async () => {
    console.log('[ShareExtDebug] Clear token button pressed');
    setBusy(true);
    appendLog('Clearing token from App Group + Keychain…');
    try {
      const ok = await deleteTokenFile();
      appendLog('deleteTokenFile result: ' + ok);
      await runDiagnostics();
    } catch (e) {
      appendLog('Clear token FAILED: ' + (e instanceof Error ? e.message : String(e)));
    }
    setBusy(false);
  }, [appendLog, runDiagnostics]);

  const handleRoundTripTest = useCallback(async () => {
    console.log('[ShareExtDebug] Run end-to-end token test button pressed');
    setRoundTripBusy(true);
    setRoundTripResult(null);
    setRoundTripPass(null);
    setRoundTripSteps([]);
    appendLog('Starting end-to-end token round-trip test…');

    const steps: { label: string; pass: boolean; detail?: string }[] = [];

    try {
      // Step 1: Session present
      const { data: { session }, error } = await supabase.auth.getSession();
      const sessionPresent = !error && session != null;
      let sessionDetail: string;
      if (sessionPresent && session) {
        const remaining = (session.expires_at ?? 0) - Date.now() / 1000;
        const expiryStr = remaining <= 0
          ? 'EXPIRED'
          : `expires in ${Math.floor(remaining / 60)}m`;
        sessionDetail = `userId: ${session.user.id} | ${expiryStr}`;
      } else {
        sessionDetail = error ? error.message : 'No active session';
      }
      steps.push({ label: 'Session present', pass: sessionPresent, detail: sessionDetail });
      setRoundTripSteps([...steps]);
      appendLog(`Step 1 — Session present: ${sessionPresent} | ${sessionDetail}`);

      if (!sessionPresent || !session) {
        appendLog('Round-trip ABORTED: no session');
        setRoundTripPass(false);
        setRoundTripBusy(false);
        return;
      }

      // Step 2: Token write
      let writePass = false;
      let writeDetail: string;
      try {
        await writeTokenToAppGroup(session);
        writePass = true;
        writeDetail = 'writeTokenToAppGroup completed without throwing';
      } catch (writeErr) {
        writeDetail = 'threw: ' + (writeErr instanceof Error ? writeErr.message : String(writeErr));
      }
      steps.push({ label: 'Token write', pass: writePass, detail: writeDetail });
      setRoundTripSteps([...steps]);
      appendLog(`Step 2 — Token write: ${writePass} | ${writeDetail}`);

      // Step 3: App Group file exists
      appendLog('Calling verifyAppGroupContainer…');
      const verify = await verifyAppGroupContainer();
      appendLog('verifyAppGroupContainer result: ' + JSON.stringify(verify));
      const fileExists = verify?.tokenFileExists === true;
      const fileDetail = verify
        ? `containerExists=${verify.containerExists} tokenFileExists=${verify.tokenFileExists} size=${verify.tokenFileSize ?? 0}b`
        : 'native module returned null';
      steps.push({ label: 'App Group file exists', pass: fileExists, detail: fileDetail });
      setRoundTripSteps([...steps]);
      appendLog(`Step 3 — App Group file exists: ${fileExists} | ${fileDetail}`);

      // Step 4: Keychain item exists
      appendLog('Calling verifyKeychainItem…');
      const kc = await verifyKeychainItem();
      appendLog('verifyKeychainItem result: ' + JSON.stringify(kc));
      const kcPresent = kc?.present === true;
      const kcDetail = kc ? `present=${kc.present} size=${kc.dataSize}b` : 'null result';
      steps.push({ label: 'Keychain item exists', pass: kcPresent, detail: kcDetail });
      setRoundTripSteps([...steps]);
      appendLog(`Step 4 — Keychain item exists: ${kcPresent} | ${kcDetail}`);

      const allPass = sessionPresent && writePass && fileExists && kcPresent;
      const summary = allPass
        ? `PASS — all 4 steps succeeded`
        : `FAIL — ${steps.filter((s) => !s.pass).map((s) => s.label).join(', ')}`;
      appendLog(summary);
      setRoundTripResult(summary);
      setRoundTripPass(allPass);
    } catch (e) {
      const msg = 'Round-trip test THREW: ' + (e instanceof Error ? e.message : String(e));
      appendLog(msg);
      setRoundTripResult(msg);
      setRoundTripPass(false);
    }

    setRoundTripBusy(false);
  }, [appendLog]);

  // Derived display values
  const ag = diag.appGroup;
  const kc = diag.keychain;
  const containerReachable = ag?.containerExists === true;
  const tokenFilePresent = ag?.tokenFileExists === true;
  const tokenFileSize = ag?.tokenFileSize ?? 0;
  const tokenModified = ag?.tokenFileModifiedTimestamp ?? 0;
  const tokenModifiedText = tokenModified > 0 ? relativeTime(tokenModified) : '—';
  const tokenFileSizeText = tokenFilePresent ? `${tokenFileSize} bytes` : '—';
  const containerPath = ag?.containerPath ?? '—';

  const expiry = diag.tokenExpiresAt ? expiryDisplay(diag.tokenExpiresAt) : null;
  const expiryText = expiry ? expiry.text : '—';
  const expiryExpired = expiry?.expired === true;

  const keychainPresent = kc?.present === true;
  const keychainSizeText = keychainPresent ? `${kc!.dataSize} bytes` : '—';

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
      <Stack.Screen options={{ title: 'Auth Diagnostics' }} />
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {/* ── Refresh ── */}
        <Pressable
          style={[styles.btn, styles.btnPrimary, busy && styles.btnDisabled]}
          onPress={handleRefresh}
          disabled={busy}
        >
          <Text style={styles.btnText}>{busy ? 'Refreshing…' : 'Refresh All'}</Text>
        </Pressable>

        {/* ── Supabase Session ── */}
        <Text style={styles.sectionTitle}>Supabase Session</Text>
        <View style={styles.card}>
          <Text style={styles.mono}>{sessionInfo}</Text>
        </View>

        {/* ── App Group Container ── */}
        <Text style={styles.sectionTitle}>App Group Container</Text>
        <View style={styles.card}>
          <StatusRow label="Container reachable" ok={containerReachable} value={containerReachable ? 'yes' : 'no'} />
          <InfoRow label="Container path" value={containerPath} />
          <StatusRow label="auth-token.json" ok={tokenFilePresent} value={tokenFilePresent ? 'present' : 'missing'} />
          <InfoRow label="Token file size" value={tokenFileSizeText} />
          <InfoRow label="Token last modified" value={tokenModifiedText} />
          <View style={rowStyles.row}>
            <Text style={[rowStyles.infoLabel]}>Token expiry</Text>
            <Text style={[rowStyles.value, expiryExpired && { color: colors.appleRed, fontWeight: '700' }]}>
              {expiryText}
            </Text>
          </View>
        </View>

        {/* ── Keychain ── */}
        <Text style={styles.sectionTitle}>Keychain Sharing</Text>
        <View style={styles.card}>
          <StatusRow label="Keychain item" ok={keychainPresent} value={keychainPresent ? 'present' : 'missing'} />
          <InfoRow label="Keychain data size" value={keychainSizeText} />
          <InfoRow label="Access group" value={KEYCHAIN_ACCESS_GROUP} />
        </View>

        {/* ── Module load error ── */}
        {ag?.moduleLoadError != null && (
          <>
            <Text style={styles.sectionTitle}>Module Load Error</Text>
            <View style={[styles.card, styles.errorCard]}>
              <Text style={styles.moduleLoadErrorLabel}>requireNativeModule('AppGroupModule') threw:</Text>
              <Text style={styles.moduleLoadErrorText}>{ag.moduleLoadError}</Text>
            </View>
          </>
        )}

        {/* ── Last Share Extension Error ── */}
        <Text style={styles.sectionTitle}>Last Share Extension Error</Text>
        <View style={styles.card}>
          {lastError === undefined ? (
            <Text style={styles.mono}>Loading…</Text>
          ) : lastError === null ? (
            <Text style={[styles.mono, { color: colors.textSecondary }]}>
              No share extension errors recorded.
            </Text>
          ) : (
            <>
              <View style={rowStyles.row}>
                <Text style={rowStyles.label}>Stage</Text>
                <Text style={[styles.mono, { flex: 1 }]}>{lastErrorStage ?? '—'}</Text>
              </View>
              {lastErrorRelTime !== null && (
                <View style={rowStyles.row}>
                  <Text style={rowStyles.label}>When</Text>
                  <Text style={[styles.mono, { flex: 1 }]}>{lastErrorRelTime}</Text>
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

        {/* ── Round-Trip Test ── */}
        <Text style={styles.sectionTitle}>End-to-End Token Test</Text>
        <Pressable
          style={[styles.btn, styles.btnSuccess, roundTripBusy && styles.btnDisabled]}
          onPress={handleRoundTripTest}
          disabled={roundTripBusy}
        >
          <Text style={styles.btnText}>
            {roundTripBusy ? 'Running…' : 'Run end-to-end token test'}
          </Text>
        </Pressable>
        {roundTripSteps.length > 0 && (
          <View style={[styles.card, { borderColor: roundTripColor }]}>
            {roundTripSteps.map((step, i) => {
              const stepIndicator = step.pass ? '✓' : '✗';
              const stepColor = step.pass ? '#4CAF50' : colors.appleRed;
              return (
                <View key={i} style={[rowStyles.row, i > 0 && { marginTop: 8 }]}>
                  <Text style={[rowStyles.indicator, { color: stepColor }]}>{stepIndicator}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.mono, { color: stepColor, fontWeight: '700' }]}>{step.label}</Text>
                    {step.detail != null && (
                      <Text style={[styles.mono, { color: colors.textSecondary, fontSize: 11, marginTop: 2 }]}>
                        {step.detail}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
            {roundTripResult !== null && (
              <Text style={[styles.mono, { color: roundTripColor, marginTop: 10, fontWeight: '600' }]}>
                {roundTripResult}
              </Text>
            )}
          </View>
        )}

        {/* ── Actions ── */}
        <Text style={styles.sectionTitle}>Actions</Text>
        <View style={styles.buttonRow}>
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
            <Text style={styles.btnText}>Clear Token (App Group + Keychain)</Text>
          </Pressable>
        </View>

        {/* ── Log ── */}
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
  errorCard: {
    borderColor: colors.appleRed,
    borderWidth: 1.5,
  },
  moduleLoadErrorLabel: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  moduleLoadErrorText: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: colors.appleRed,
    lineHeight: 18,
  },
});
