"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { Shell, type Navigate } from "@/features/app/shell";
import { api } from "@/lib/api";
import "./property-assistant.css";
import "./property-questions-inbox.css";

type Question = Awaited<ReturnType<typeof api.conversations.escalations>>[number];

export function PropertyQuestionsInbox({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const load = useCallback(async () => {
    if (!session) return;
    const items = await api.conversations.escalations(session.accessToken);
    setQuestions(items);
    setSelected((current) => items.some((item) => item.id === current) ? current : items[0]?.id ?? null);
  }, [session]);
  useEffect(() => {
    void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Unable to load questions.")).finally(() => setLoading(false));
  }, [load]);
  const active = questions.find((item) => item.id === selected);
  const send = async () => {
    if (!session || !active || !draft.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      await api.conversations.replyToEscalation(session.accessToken, active.id, draft.trim());
      setDraft("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send your answer.");
    } finally { setSending(false); }
  };
  if (!session) return null;
  const role = session.user.roles.includes("LANDLORD") ? "landlord" : "agent";
  return <Shell go={go} role={role} title="Property questions">
    <div className="page property-assistant-live property-questions-inbox">
      <div className="page-title"><span><small>Property Assistant</small><h1>Property questions</h1><p>Answer questions forwarded by the assistant. Your exact answer will be relayed to the tenant by the assistant.</p></span></div>
      {error && <p role="alert">{error}</p>}
      <section className="live-assistant">
        <aside className="live-conversation-list"><b>Questions</b>
          {loading ? <p>Loading questions…</p> : questions.length ? questions.map((question) =>
            <button key={question.id} type="button" className={question.id === selected ? "active" : undefined} onClick={() => { setSelected(question.id); setDraft(""); }}>
              <span><strong>{question.conversation.listing?.title ?? "Property"}</strong><small>{question.respondedAt ? "Answered" : "Awaiting your answer"}</small></span>
            </button>) : <p>No questions have been forwarded yet.</p>}
        </aside>
        <div className="live-message-panel">
          <header><span><b>{active?.conversation.listing?.title ?? "Property question"}</b><small>{active ? new Date(active.createdAt).toLocaleString("en-NG") : "Select a question"}</small></span></header>
          <div className="live-messages" aria-live="polite">
            {active && <article className="live-message"><span>Tenant's question</span><p>{active.question}</p></article>}
            {active?.response && <article className="live-message mine"><span>Your answer, relayed by the assistant</span><p>{active.response}</p></article>}
          </div>
          {active && !active.respondedAt && <form className="live-compose" onSubmit={(event) => { event.preventDefault(); void send(); }}>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a factual answer…" maxLength={5000} disabled={sending} />
            <Button type="submit" disabled={!draft.trim() || sending}>{sending ? "Sending…" : "Send answer"}</Button>
          </form>}
        </div>
      </section>
    </div>
  </Shell>;
}
