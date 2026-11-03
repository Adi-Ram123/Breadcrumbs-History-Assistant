import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { getHealth, type HealthResponse, postAnswer, postAsk } from '../../lib/api/client';
import { firstOpenSentence, syncAgoLabel } from '../../lib/copy';
import {
  canStillAnswer,
  initialThread,
  isBusy,
  lastQuestion,
  nextAnnouncement,
  statusText,
  type ThreadState,
  threadReducer,
} from '../../lib/thread';
import { AnswerCard } from './components/AnswerCard';
import { Composer } from './components/Composer';
import { DiagnosticsLine } from './components/DiagnosticsLine';
import { EmptyState } from './components/EmptyState';
import { NoMatchCard } from './components/NoMatchCard';
import { OfflineCard } from './components/OfflineCard';
import { RejectedCard } from './components/RejectedCard';
import { Thread } from './components/Thread';
import { TopBar } from './components/TopBar';

const DIAG_KEY = 'showDiagnostics';
const SYNC_KEY = 'lastSyncedMs';
const OFFLINE_POLL_MS = 5000;
const UNDO_MS = 5000;

/** The side panel. The only place that reads the wall clock; everything it shows comes from lib/. */
export default function App() {
  const [state, dispatch] = useReducer(threadReducer, initialThread);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [offline, setOffline] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const [lastSyncedMs, setLastSyncedMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const platform = useMemo<'mac' | 'other'>(() => (/Mac/.test(navigator.userAgent) ? 'mac' : 'other'), []);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Refs let async callbacks see the latest values without re-subscribing.
  const stateRef = useRef<ThreadState>(state);
  stateRef.current = state;
  const healthRef = useRef(health);
  healthRef.current = health;
  const offlineRef = useRef(offline);
  offlineRef.current = offline;
  const answerCtl = useRef<AbortController | null>(null);

  // Open: sync history (as before), read health and settings, and keep "now" roughly fresh.
  useEffect(() => {
    browser.runtime.sendMessage({ type: 'sync' }).catch(() => {});
    getHealth().then(setHealth);
    browser.storage.local.get([DIAG_KEY, SYNC_KEY]).then((v) => {
      setShowDiag(v[DIAG_KEY] === true);
      setLastSyncedMs(typeof v[SYNC_KEY] === 'number' ? (v[SYNC_KEY] as number) : null);
    });
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'local') return;
      if (DIAG_KEY in changes) setShowDiag(changes[DIAG_KEY]!.newValue === true);
      if (SYNC_KEY in changes) {
        const v = changes[SYNC_KEY]!.newValue;
        setLastSyncedMs(typeof v === 'number' ? v : null);
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    const tick = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => {
      browser.storage.onChanged.removeListener(onChanged);
      clearInterval(tick);
    };
  }, []);

  // While offline, check /health every 5 s and re-enable sending when it answers.
  useEffect(() => {
    if (!offline) return;
    const t = setInterval(async () => {
      const h = await getHealth();
      if (h) {
        setHealth(h);
        setOffline(false);
      }
    }, OFFLINE_POLL_MS);
    return () => clearInterval(t);
  }, [offline]);

  // One polite status line, updated when the newest card settles.
  const newest = state.exchanges.at(-1);
  const announce = newest ? statusText(newest) : null;
  const announceKey = newest ? `${newest.id}:${newest.card.phase}:${announce}` : '';
  useEffect(() => {
    if (announce) setStatus((prev) => nextAnnouncement(prev, announce));
  }, [announceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // New chat keeps an Undo for 5 s.
  useEffect(() => {
    if (!state.undo) return;
    const t = setTimeout(() => dispatch({ type: 'dropUndo' }), UNDO_MS);
    return () => clearTimeout(t);
  }, [state.undo]);

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || offlineRef.current || isBusy(stateRef.current)) return;
      const id = stateRef.current.nextId;
      dispatch({ type: 'send', question });
      setNowMs(Date.now());
      setDraft('');

      const res = await postAsk(question, tz);
      // New chat may have cleared this question while /ask ran: then nothing more is sent for it.
      if (!canStillAnswer(stateRef.current, id)) return;
      if (res.status !== 'ok') {
        if (res.status === 'rejected') dispatch({ type: 'askFailed', id, status: 'rejected', detail: res.detail });
        else if (res.status === 'not_found') dispatch({ type: 'askFailed', id, status: 'rejected', detail: 'HTTP 404' });
        else {
          dispatch({ type: 'askFailed', id, status: 'offline' });
          setOffline(true);
          setDraft((d) => d || question); // the question wasn't asked; keep it ready to send again
        }
        return;
      }
      dispatch({ type: 'askOk', id, ask: res.data, nowMs: Date.now() });
      if (res.data.mode !== 'results') return;

      const h = healthRef.current ?? (await getHealth());
      if (h && !healthRef.current) setHealth(h);
      if (!canStillAnswer(stateRef.current, id)) return;
      if (h?.llm_mode === 'off') {
        dispatch({ type: 'skipAnswer', id });
        return;
      }
      const ctl = new AbortController();
      answerCtl.current = ctl;
      const ans = await postAnswer(res.data.ask_id, ctl.signal);
      if (answerCtl.current === ctl) answerCtl.current = null;
      if (ans.status === 'ok') dispatch({ type: 'answerOk', id, res: ans.data });
      else if (ans.status !== 'aborted') dispatch({ type: 'answerFailed', id });
    },
    [tz],
  );

  const writingId = newest?.card.phase === 'writing' ? newest.id : null;
  const stop = useCallback(() => {
    if (writingId === null) return;
    answerCtl.current?.abort();
    dispatch({ type: 'stop', id: writingId });
  }, [writingId]);

  // Esc stops a running answer from anywhere in the panel (the open menu takes Esc first).
  useEffect(() => {
    if (writingId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) stop();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [writingId, stop]);

  const newChat = () => {
    answerCtl.current?.abort();
    answerCtl.current = null;
    dispatch({ type: 'newChat' });
    inputRef.current?.focus();
  };

  const retry = async (question: string) => {
    const h = await getHealth();
    if (!h) return;
    setHealth(h);
    offlineRef.current = false;
    setOffline(false);
    void ask(question);
  };

  const openUrl = (url: string) => {
    browser.tabs.create({ url, active: false }).catch(() => {});
  };

  const renderCard = (e: (typeof state.exchanges)[number], latest: boolean) => {
    const card = e.card;
    switch (card.phase) {
      case 'asking':
      case 'writing':
      case 'answered':
        return (
          <AnswerCard
            exchange={e}
            tz={tz}
            nowMs={nowMs}
            latest={latest}
            showDiag={showDiag}
            onToggleRows={() => dispatch({ type: 'toggleRows', id: e.id })}
            onToggleMore={() => dispatch({ type: 'toggleMore', id: e.id })}
            onToggleDiag={() => dispatch({ type: 'toggleDiag', id: e.id })}
            onOpen={openUrl}
          />
        );
      case 'no-match':
        return (
          <NoMatchCard ask={card.ask} tz={tz} nowMs={nowMs} onReask={(q) => void ask(q)}>
            {showDiag && (
              <DiagnosticsLine
                mode="no-match"
                intent={card.ask.intent}
                timings={card.ask.timings_ms}
                writeMs={null}
                tz={tz}
                open={e.diagOpen}
                onToggle={() => dispatch({ type: 'toggleDiag', id: e.id })}
              />
            )}
          </NoMatchCard>
        );
      case 'offline':
        return <OfflineCard onRetry={() => void retry(e.question)} />;
      case 'rejected':
        return <RejectedCard detail={card.detail} />;
    }
  };

  const busy = isBusy(state);
  const undoToast = state.undo ? (
    <div className="toast" style={{ bottom: 12 }} role="group" aria-label="Chat cleared">
      Chat cleared
      <button type="button" onClick={() => dispatch({ type: 'undo' })}>
        Undo
      </button>
    </div>
  ) : undefined;

  return (
    <div className="panel">
      <TopBar
        onNewChat={newChat}
        onSync={() => {
          browser.runtime.sendMessage({ type: 'sync' }).catch(() => {});
          setNowMs(Date.now());
        }}
        syncLabel={syncAgoLabel(lastSyncedMs, nowMs, tz)}
        showDiag={showDiag}
        onToggleDiag={(on) => {
          setShowDiag(on);
          void browser.storage.local.set({ [DIAG_KEY]: on });
        }}
      />
      <Thread
        exchanges={state.exchanges}
        renderCard={renderCard}
        overlay={undoToast}
        empty={
          <EmptyState
            sentence={firstOpenSentence(health ? health.entry_count : null, health?.history_start ?? null, tz, platform)}
            onAsk={(q) => void ask(q)}
            disabled={offline}
          />
        }
      />
      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => void ask(draft)}
        onStop={stop}
        writing={writingId !== null}
        busy={busy}
        paused={offline}
        lastQuestion={lastQuestion(state)}
        inputRef={inputRef}
      />
      <div className="sr-only" role="status" aria-live="polite">
        {status}
      </div>
    </div>
  );
}
