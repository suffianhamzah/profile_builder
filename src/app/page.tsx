"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type {
  ChatEvent,
  ChatRequest,
  ClearStateRequest,
  ClearStateResponse,
  ResolveConflictRequest,
} from "@/lib/api-contracts";
import { createEmptyProfile } from "@/lib/domain";
import type {
  ChatMessage,
  PersistedState,
  ProfileConflict,
  TravelProfile,
} from "@/lib/domain";
import { readChatEventStream } from "@/lib/sse-client";

const fieldLabels: Record<keyof TravelProfile, string> = {
  budgetStyle: "Budget style",
  travelPace: "Travel pace",
  wishlist: "Wishlist",
  visitedDestinations: "Places visited",
  interests: "Interests",
  preferredSeasons: "Preferred seasons",
  dietaryPreferences: "Food preferences",
  accommodationPreferences: "Stay preferences",
  additionalPreferences: "Other preferences",
};

const listFields: Array<keyof TravelProfile> = [
  "wishlist",
  "visitedDestinations",
  "interests",
  "preferredSeasons",
  "dietaryPreferences",
  "accommodationPreferences",
  "additionalPreferences",
];

function prettyValue(value: string) {
  if (value === "midRange") return "Mid-range";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type ProfilePanelProps = {
  profile: TravelProfile;
  disabled: boolean;
  clearing: boolean;
  onClear: () => void;
};

function ProfilePanel({ profile, disabled, clearing, onClear }: ProfilePanelProps) {
  const hasProfile =
    Boolean(profile.budgetStyle || profile.travelPace) ||
    listFields.some((field) => (profile[field] as string[]).length > 0);

  return (
    <aside className="profile-panel" aria-labelledby="profile-heading">
      <div className="profile-heading-row">
        <div>
          <p className="eyebrow">Your travel compass</p>
          <h2 id="profile-heading">Travel profile</h2>
        </div>
        <div className="heading-actions">
          <span className="live-badge"><i aria-hidden="true" />Live</span>
          <button
            type="button"
            className="clear-button"
            disabled={disabled}
            onClick={onClear}
          >
            {clearing ? "Clearing…" : "Clear profile"}
          </button>
        </div>
      </div>

      {!hasProfile ? (
        <div className="profile-empty">
          <div className="empty-mark" aria-hidden="true">✦</div>
          <h3>Your profile will take shape here</h3>
          <p>Share how you like to travel, and Atlas will organize the useful details as you chat.</p>
        </div>
      ) : (
        <div className="profile-sections">
          {(profile.budgetStyle || profile.travelPace) && (
            <section className="profile-section">
              <h3>Trip style</h3>
              <dl className="facts">
                {profile.budgetStyle && (
                  <div><dt>Budget</dt><dd>{prettyValue(profile.budgetStyle)}</dd></div>
                )}
                {profile.travelPace && (
                  <div><dt>Pace</dt><dd>{prettyValue(profile.travelPace)}</dd></div>
                )}
              </dl>
            </section>
          )}

          {listFields.map((field) => {
            const values = profile[field] as string[];
            if (values.length === 0) return null;
            return (
              <section className="profile-section" key={field}>
                <h3>{fieldLabels[field]}</h3>
                <ul className="tag-list">
                  {values.map((value) => <li key={`${field}-${value}`}>{prettyValue(value)}</li>)}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={`message-row ${message.role}`}>
      {message.role === "assistant" && <div className="assistant-avatar" aria-hidden="true">A</div>}
      <div className="message-bubble">{message.content}</div>
    </div>
  );
}

type ConflictPanelProps = {
  conflict: ProfileConflict;
  disabled: boolean;
  onDecision: (decision: ResolveConflictRequest["decision"]) => Promise<void>;
};

function ConflictPanel({ conflict, disabled, onDecision }: ConflictPanelProps) {
  return (
    <section className="conflict-panel" aria-labelledby="conflict-title">
      <div className="conflict-icon" aria-hidden="true">?</div>
      <div className="conflict-content">
        <p className="eyebrow">Quick clarification</p>
        <h3 id="conflict-title">Which should I remember?</h3>
        <p className="conflict-reason">{conflict.reason}</p>
        <div className="comparison" aria-label="Preference comparison">
          <div><span>Current</span><strong>{conflict.existingValue}</strong></div>
          <div><span>Proposed</span><strong>{conflict.proposedValue}</strong></div>
        </div>
        <div className="conflict-actions">
          <button type="button" className="primary-button" disabled={disabled} onClick={() => void onDecision("accept")}>
            Use proposed
          </button>
          <button type="button" className="secondary-button" disabled={disabled} onClick={() => void onDecision("reject")}>
            Keep current
          </button>
        </div>
        <p className="conflict-reason">
          Or type a different answer in the message box below.
        </p>
      </div>
    </section>
  );
}

export default function Home() {
  const [profile, setProfile] = useState<TravelProfile>(createEmptyProfile());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingConflicts, setPendingConflicts] = useState<ProfileConflict[]>([]);
  const [draft, setDraft] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [loadingState, setLoadingState] = useState(true);
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [clearingTarget, setClearingTarget] = useState<ClearStateRequest["target"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const conversationEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadState() {
      try {
        const response = await fetch("/api/state", { signal: controller.signal });
        if (!response.ok) throw new Error(`Could not load your profile (${response.status}).`);
        const state = (await response.json()) as PersistedState;
        setProfile(state.profile);
        setMessages(state.messages);
        setPendingConflicts(state.pendingConflicts);
      } catch (loadError) {
        if ((loadError as Error).name !== "AbortError") {
          setError(loadError instanceof Error ? loadError.message : "Could not load your profile.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingState(false);
      }
    }

    void loadState();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, streamingText, pendingConflicts]);

  function handleChatEvent(event: ChatEvent) {
    if (event.type === "user.message.created") {
      setMessages((current) =>
        current.some((message) => message.id === event.userMessage.id)
          ? current
          : [...current, event.userMessage],
      );
    } else if (event.type === "state.updated") {
      setProfile(event.profile);
      setPendingConflicts(event.pendingConflicts);
    } else if (event.type === "assistant.delta") {
      setStreamingText((current) => current + event.text);
    } else if (event.type === "turn.completed") {
      setStreamingText("");
      setMessages((current) =>
        current.some((message) => message.id === event.assistantMessage.id)
          ? current
          : [...current, event.assistantMessage],
      );
    } else if (event.type === "error") {
      setError(event.message);
    }
  }

  async function sendMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed || sending || resolving) return;
    const resolvingConflictId = pendingConflicts[0]?.id;

    const optimisticMessage: ChatMessage = {
      id: `local-${crypto.randomUUID()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimisticMessage]);
    setDraft("");
    setStreamingText("");
    setError(null);
    setSending(true);

    const request: ChatRequest = { message: trimmed, resolvingConflictId };
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(request),
      });
      await readChatEventStream(response, handleChatEvent);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Atlas could not answer right now.");
    } finally {
      setSending(false);
    }
  }

  async function resolveConflict(decision: ResolveConflictRequest["decision"]) {
    const conflict = pendingConflicts[0];
    if (!conflict || resolving || sending) return;

    setResolving(true);
    setError(null);
    try {
      const response = await fetch(`/api/conflicts/${encodeURIComponent(conflict.id)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ decision } satisfies ResolveConflictRequest),
      });
      await readChatEventStream(response, handleChatEvent);
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "Could not save that choice.");
    } finally {
      setResolving(false);
    }
  }

  async function clearSavedState(target: ClearStateRequest["target"]) {
    if (loadingState || sending || resolving || clearingTarget) return;

    const description = target === "conversation"
      ? "Clear the saved conversation? Your travel profile will be kept."
      : "Clear your travel profile? Your conversation will be kept.";
    if (!window.confirm(description)) return;

    setClearingTarget(target);
    setError(null);
    try {
      const response = await fetch("/api/state/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target } satisfies ClearStateRequest),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Could not clear the ${target} (${response.status}).`);
      }

      const result = (await response.json()) as ClearStateResponse;
      setProfile(result.state.profile);
      setMessages(result.state.messages);
      setPendingConflicts(result.state.pendingConflicts);
      setStreamingText("");
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : `Could not clear the ${target}.`);
    } finally {
      setClearingTarget(null);
    }
  }

  function submitChat(event: FormEvent) {
    event.preventDefault();
    void sendMessage(draft);
  }

  const activeConflict = pendingConflicts[0];
  const busy = sending || resolving || clearingTarget !== null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">A</div>
        <div>
          <h1>Atlas</h1>
          <p>Your thoughtful travel companion</p>
        </div>
      </header>

      <div className="workspace">
        <section className="chat-panel" aria-labelledby="chat-heading">
          <div className="chat-heading">
            <div>
              <p className="eyebrow">Plan through conversation</p>
              <h2 id="chat-heading">Where will you go next?</h2>
            </div>
            <div className="heading-actions">
              <span className="privacy-note">One local travel profile</span>
              <button
                type="button"
                className="clear-button"
                disabled={loadingState || busy || messages.length === 0}
                onClick={() => void clearSavedState("conversation")}
              >
                {clearingTarget === "conversation" ? "Clearing…" : "Clear conversation"}
              </button>
            </div>
          </div>

          <div className="conversation" aria-live="polite" aria-busy={loadingState}>
            {loadingState ? (
              <div className="loading-state"><span className="spinner" />Loading your journey…</div>
            ) : messages.length === 0 && !streamingText ? (
              <div className="welcome-message">
                <div className="welcome-icon" aria-hidden="true">⌁</div>
                <h3>Let’s build your travel profile</h3>
                <p>Tell me about a favorite trip, somewhere on your wishlist, or how you like to travel.</p>
                <div className="starter-prompts" aria-label="Conversation starters">
                  {["I love slow trips centered around food", "Tokyo is at the top of my wishlist"].map((prompt) => (
                    <button key={prompt} type="button" disabled={busy || Boolean(activeConflict)} onClick={() => void sendMessage(prompt)}>{prompt}</button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
                {(streamingText || sending || resolving) && (
                  <div className="message-row assistant">
                    <div className="assistant-avatar" aria-hidden="true">A</div>
                    <div className={`message-bubble streaming ${streamingText ? "" : "waiting"}`}>
                      {streamingText || <><span /><span /><span /></>}
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={conversationEnd} />
          </div>

          <div className="composer-region">
            {activeConflict && (
              <ConflictPanel
                key={activeConflict.id}
                conflict={activeConflict}
                disabled={busy}
                onDecision={resolveConflict}
              />
            )}

            {error && (
              <div className="error-banner" role="alert">
                <span>{error}</span>
                <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">×</button>
              </div>
            )}

            <form className="composer" onSubmit={submitChat}>
              <label htmlFor="message">
                {activeConflict ? "Answer this clarification" : "Message Atlas"}
              </label>
              <textarea
                id="message"
                rows={2}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={activeConflict
                  ? "Type a different answer for this preference…"
                  : "Share a destination or travel preference…"}
                disabled={loadingState || busy}
              />
              <button className="send-button" type="submit" disabled={loadingState || busy || !draft.trim()} aria-label="Send message">
                {sending ? <span className="spinner light" /> : <span aria-hidden="true">↑</span>}
              </button>
            </form>
            <p className="composer-hint">
              {activeConflict
                ? "Your answer will resolve the clarification above"
                : "Enter to send · Shift + Enter for a new line"}
            </p>
          </div>
        </section>

        <ProfilePanel
          profile={profile}
          disabled={loadingState || busy}
          clearing={clearingTarget === "profile"}
          onClear={() => void clearSavedState("profile")}
        />
      </div>
    </main>
  );
}
