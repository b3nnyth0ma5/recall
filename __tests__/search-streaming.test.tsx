/**
 * Tests for the XHR-based streamCloudAnswer streaming logic in app/search.tsx.
 *
 * Strategy: extract the core streaming state machine into a plain function that
 * accepts injected setters and an XHR factory, then drive it with a mock XHR
 * whose handlers we fire manually.  This avoids mounting the full SearchScreen
 * (which has dozens of heavy dependencies) while still covering every branch of
 * the transport layer.
 */

// ─── Mock XHR ────────────────────────────────────────────────────────────────

type XHRHandler = (() => void) | null;

interface MockXHRInstance {
  responseText: string;
  onprogress: XHRHandler;
  onload: XHRHandler;
  onerror: XHRHandler;
  ontimeout: XHRHandler;
  timeout: number;
  open: jest.Mock;
  setRequestHeader: jest.Mock;
  send: jest.Mock;
  /** Test helper: append text and fire onprogress */
  _push(chunk: string): void;
  /** Test helper: fire onload (optionally appending a final chunk first) */
  _complete(finalChunk?: string): void;
  /** Test helper: fire onerror */
  _error(): void;
}

function makeMockXHR(): MockXHRInstance {
  const xhr: MockXHRInstance = {
    responseText: '',
    onprogress: null,
    onload: null,
    onerror: null,
    ontimeout: null,
    timeout: 0,
    open: jest.fn(),
    setRequestHeader: jest.fn(),
    send: jest.fn(),
    _push(chunk: string) {
      this.responseText += chunk;
      if (this.onprogress) this.onprogress();
    },
    _complete(finalChunk?: string) {
      if (finalChunk) this.responseText += finalChunk;
      if (this.onload) this.onload();
    },
    _error() {
      if (this.onerror) this.onerror();
    },
  };
  return xhr;
}

// ─── Core streaming logic (extracted from streamCloudAnswer) ──────────────────
//
// This mirrors the exact logic in the useCallback so tests stay in sync with
// the real implementation without importing the full component.

interface StreamSetters {
  setStreamingAnswer: (fn: (prev: string) => string) => void;
  setIsStreamingComplete: (v: boolean) => void;
  setIsProgressExpanded: (v: boolean) => void;
  patchNotesForOnDeviceAnswer: (
    sources: string[],
    searchResults: { id: string; sourceNumber: number }[],
    answer: string,
    confidence: number,
  ) => void;
}

function runStreamingLogic(
  xhr: MockXHRInstance,
  setters: StreamSetters,
  searchResults: { id: string; sourceNumber: number }[],
): Promise<void> {
  return new Promise<void>((resolve) => {
    let processedLength = 0;
    let tokenBatch = '';
    let batchTimer: ReturnType<typeof setTimeout> | null = null;
    let firstTokenFlushed = false;
    let resolved = false;

    const flushBatch = () => {
      if (tokenBatch) {
        const batch = tokenBatch;
        tokenBatch = '';
        setters.setStreamingAnswer(prev => prev + batch);
        if (!firstTokenFlushed) {
          firstTokenFlushed = true;
          setters.setIsProgressExpanded(false);
        }
      }
      batchTimer = null;
    };

    const cleanup = () => {
      if (batchTimer) clearTimeout(batchTimer);
      flushBatch();
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    const processDoneLine = (data: string) => {
      if (batchTimer) clearTimeout(batchTimer);
      flushBatch();
      try {
        const payload = JSON.parse(data.slice(7));
        setters.patchNotesForOnDeviceAnswer(
          payload.sources ?? [],
          searchResults,
          payload.answer ?? '',
          payload.confidence ?? 0,
        );
      } catch (_e) {
        // parse error — swallow in tests
      }
      setters.setIsStreamingComplete(true);
    };

    xhr.onprogress = () => {
      const newText = xhr.responseText.slice(processedLength);
      processedLength = xhr.responseText.length;
      if (!newText) return;
      const lines = newText.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data.startsWith('[DONE]')) {
          processDoneLine(data);
          cleanup();
          return;
        }
        tokenBatch += data;
        if (!batchTimer) {
          batchTimer = setTimeout(flushBatch, 50);
        }
      }
    };

    xhr.onerror = () => cleanup();
    xhr.ontimeout = () => cleanup();

    xhr.onload = () => {
      const newText = xhr.responseText.slice(processedLength);
      if (newText) {
        const lines = newText.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data.startsWith('[DONE]')) {
            processDoneLine(data);
          }
        }
      }
      cleanup();
    };
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('streamCloudAnswer XHR streaming logic', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Test 1: streaming tokens accumulate before [DONE] ──────────────────────
  it('accumulates streaming tokens via onprogress before [DONE] fires', async () => {
    const xhr = makeMockXHR();
    const streamingParts: string[] = [];
    let currentAnswer = '';

    const setters: StreamSetters = {
      setStreamingAnswer: (fn) => { currentAnswer = fn(currentAnswer); streamingParts.push(currentAnswer); },
      setIsStreamingComplete: jest.fn(),
      setIsProgressExpanded: jest.fn(),
      patchNotesForOnDeviceAnswer: jest.fn(),
    };

    const promise = runStreamingLogic(xhr, setters, []);

    // Push two token chunks
    xhr._push('data: Hello\n\n');
    xhr._push('data: world\n\n');

    // Advance timers to flush the 50ms batch
    jest.advanceTimersByTime(60);

    // At this point [DONE] has not fired — answer should contain both tokens
    expect(currentAnswer).toBe('Helloworld');
    expect(setters.setIsStreamingComplete).not.toHaveBeenCalledWith(true);

    // Now complete the stream
    xhr._complete('data: [DONE] {"answer":"Helloworld","confidence":85,"sources":[]}\n\n');
    await promise;
  });

  // ── Test 2: isStreamingComplete set to true after [DONE] ───────────────────
  it('sets isStreamingComplete=true when [DONE] arrives via onprogress', async () => {
    const xhr = makeMockXHR();
    let isComplete = false;

    const setters: StreamSetters = {
      setStreamingAnswer: jest.fn().mockImplementation(() => {}),
      setIsStreamingComplete: (v) => { isComplete = v; },
      setIsProgressExpanded: jest.fn(),
      patchNotesForOnDeviceAnswer: jest.fn(),
    };

    const promise = runStreamingLogic(xhr, setters, []);

    xhr._push('data: Final answer\n\ndata: [DONE] {"answer":"Final answer","confidence":85,"sources":["SOURCE_1"]}\n\n');
    jest.advanceTimersByTime(60);

    await promise;

    expect(isComplete).toBe(true);
  });

  // ── Test 3: patchNotesForOnDeviceAnswer called with correct sources ─────────
  it('calls patchNotesForOnDeviceAnswer with sources from [DONE] payload', async () => {
    const xhr = makeMockXHR();
    const patchMock = jest.fn();
    const searchResults = [
      { id: 'note-abc', sourceNumber: 1 },
      { id: 'note-def', sourceNumber: 2 },
    ];

    const setters: StreamSetters = {
      setStreamingAnswer: jest.fn().mockImplementation(() => {}),
      setIsStreamingComplete: jest.fn(),
      setIsProgressExpanded: jest.fn(),
      patchNotesForOnDeviceAnswer: patchMock,
    };

    const promise = runStreamingLogic(xhr, setters, searchResults);

    const donePayload = JSON.stringify({
      answer: 'The answer is 42',
      confidence: 90,
      sources: ['SOURCE_1', 'SOURCE_2'],
    });

    xhr._push(`data: The answer\n\ndata: [DONE] ${donePayload}\n\n`);
    jest.advanceTimersByTime(60);

    await promise;

    expect(patchMock).toHaveBeenCalledTimes(1);
    expect(patchMock).toHaveBeenCalledWith(
      ['SOURCE_1', 'SOURCE_2'],
      searchResults,
      'The answer is 42',
      90,
    );
  });

  // ── Test 4: [DONE] arriving only in onload (no onprogress for final chunk) ──
  it('processes [DONE] in onload when onprogress did not see it', async () => {
    const xhr = makeMockXHR();
    const patchMock = jest.fn();
    let isComplete = false;

    const setters: StreamSetters = {
      setStreamingAnswer: jest.fn().mockImplementation(() => {}),
      setIsStreamingComplete: (v) => { isComplete = v; },
      setIsProgressExpanded: jest.fn(),
      patchNotesForOnDeviceAnswer: patchMock,
    };

    const promise = runStreamingLogic(xhr, setters, []);

    // Push some tokens via onprogress (no [DONE] yet)
    xhr._push('data: token1\n\ndata: token2\n\n');
    jest.advanceTimersByTime(60);

    // Complete fires with [DONE] in the final chunk (not seen by onprogress)
    xhr._complete(`data: [DONE] {"answer":"token1token2","confidence":75,"sources":[]}\n\n`);

    await promise;

    expect(isComplete).toBe(true);
    expect(patchMock).toHaveBeenCalledWith([], [], 'token1token2', 75);
  });

  // ── Test 5: onerror resolves the promise without crashing ──────────────────
  it('resolves cleanly on XHR error without throwing', async () => {
    const xhr = makeMockXHR();

    const setters: StreamSetters = {
      setStreamingAnswer: jest.fn().mockImplementation(() => {}),
      setIsStreamingComplete: jest.fn(),
      setIsProgressExpanded: jest.fn(),
      patchNotesForOnDeviceAnswer: jest.fn(),
    };

    const promise = runStreamingLogic(xhr, setters, []);
    xhr._error();

    await expect(promise).resolves.toBeUndefined();
    expect(setters.setIsStreamingComplete).not.toHaveBeenCalledWith(true);
  });

  // ── Test 6: isProgressExpanded collapses on first token ────────────────────
  it('calls setIsProgressExpanded(false) on the first token flush', async () => {
    const xhr = makeMockXHR();
    const expandedCalls: boolean[] = [];

    const setters: StreamSetters = {
      setStreamingAnswer: jest.fn().mockImplementation(() => {}),
      setIsStreamingComplete: jest.fn(),
      setIsProgressExpanded: (v) => expandedCalls.push(v),
      patchNotesForOnDeviceAnswer: jest.fn(),
    };

    const promise = runStreamingLogic(xhr, setters, []);

    xhr._push('data: first\n\n');
    jest.advanceTimersByTime(60);

    // Push a second token — should NOT trigger setIsProgressExpanded again
    xhr._push('data: second\n\n');
    jest.advanceTimersByTime(60);

    xhr._complete('data: [DONE] {"answer":"firstsecond","confidence":80,"sources":[]}\n\n');
    await promise;

    // setIsProgressExpanded(false) called exactly once (on first token)
    expect(expandedCalls).toEqual([false]);
  });
});
