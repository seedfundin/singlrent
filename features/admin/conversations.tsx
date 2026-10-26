"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Filter,
  MessageCircle,
  Search,
  Send,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppNavigation, useAppSession } from "@/features/app/app-provider";
import { Shell, Status } from "@/features/app/shell";
import { api, type ApiMessage } from "@/lib/api";

type Result = Awaited<ReturnType<typeof api.conversations.monitoring>>;
type Conversation = Result["items"][number];

const emptyFilters = {
  property: "",
  tenant: "",
  contact: "",
  from: "",
  to: "",
  status: "",
};
const adminWorkspace = "admin" as const;

function personName(person: { firstName: string; lastName: string } | null | undefined) {
  const name = person ? `${person.firstName} ${person.lastName}`.trim() : "";
  return name || "Tenant";
}

function tenantName(conversation: Conversation) {
  return personName(conversation.members[0]?.user);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "SR";
}

function relativeTime(value: string | null) {
  if (!value) return "No messages yet";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short" }).format(new Date(value));
}

function messageAuthor(message: ApiMessage) {
  if (message.kind === "AI") return "Property Assistant";
  if (message.kind === "SYSTEM") return "SingleRent";
  return personName(message.sender);
}

function messageIcon(message: ApiMessage) {
  return message.kind === "AI" ? Bot : message.kind === "SYSTEM" ? CheckCircle2 : UserRound;
}

function hasPendingQuestion(conversation: Conversation) {
  return conversation.escalations.some((question) => !question.respondedAt);
}

export function AdminConversationsPage() {
  const { go } = useAppNavigation();
  const { session } = useAppSession();
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const data = await api.conversations.monitoring(session.accessToken, { ...applied, page });
    setResult(data);
    setSelected((current) => data.items.some((item) => item.id === current) ? current : data.items[0]?.id ?? null);
  }, [applied, page, session]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Unable to load conversations."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const conversation = result?.items.find((item) => item.id === selected);
  const activeFilters = Object.values(applied).filter(Boolean).length;
  const summary = useMemo(() => {
    const conversations = result?.items ?? [];
    const pending = conversations.reduce((count, item) => count + item.escalations.filter((entry) => !entry.respondedAt).length, 0);
    const answered = conversations.reduce((count, item) => count + item.escalations.filter((entry) => entry.respondedAt).length, 0);
    return { pending, answered };
  }, [result]);

  const applyFilters = () => {
    setError("");
    setPage(1);
    setApplied(filters);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setFilters(emptyFilters);
    setApplied(emptyFilters);
    setPage(1);
    setFiltersOpen(false);
  };

  if (!session) return null;

  return (
    <Shell go={go} role={adminWorkspace} title="Conversations">
      <main className="page conversation-monitor">
        <header className="conversation-monitor-heading">
          <span>
            <small>Conversation monitoring</small>
            <h1>Property conversations</h1>
            <p>See what tenants asked, what the assistant answered, and whether a property contact still needs to respond.</p>
          </span>
          <Button variant="outline" onClick={() => setFiltersOpen((current) => !current)}>
            <SlidersHorizontal size={15} /> {filtersOpen ? "Close filters" : "Filter conversations"}
            {activeFilters > 0 && <b>{activeFilters}</b>}
          </Button>
        </header>

        <section className="conversation-monitor-stats" aria-label="Conversation summary">
          <article>
            <i><MessageCircle size={18} /></i>
            <span><small>Conversations</small><strong>{result?.total ?? 0}</strong><p>Tenant assistant chats being monitored</p></span>
          </article>
          <article className={summary.pending ? "attention" : ""}>
            <i><CircleAlert size={18} /></i>
            <span><small>Needs a reply · this page</small><strong>{summary.pending}</strong><p>Questions awaiting a landlord or agent</p></span>
          </article>
          <article>
            <i><CheckCircle2 size={18} /></i>
            <span><small>Answered · this page</small><strong>{summary.answered}</strong><p>Property-contact replies on this page</p></span>
          </article>
        </section>

        {filtersOpen && (
          <form className="conversation-filter-panel" onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
            <div className="conversation-filter-title"><span><Filter size={15} /><b>Refine the conversation list</b><small>Use only the details you need. You can clear these at any time.</small></span><button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X size={16} /></button></div>
            <div className="conversation-filter-fields">
              <label>Property<input placeholder="e.g. Beautiful home" value={filters.property} onChange={(event) => setFilters({ ...filters, property: event.target.value })} /></label>
              <label>Tenant<input placeholder="Tenant name" value={filters.tenant} onChange={(event) => setFilters({ ...filters, tenant: event.target.value })} /></label>
              <label>Landlord or agent<input placeholder="Property contact name" value={filters.contact} onChange={(event) => setFilters({ ...filters, contact: event.target.value })} /></label>
              <label>Question status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All conversations</option><option value="pending">Awaiting property contact</option><option value="answered">Questions answered</option></select></label>
              <label>From<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
              <label>To<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
            </div>
            <footer><Button type="button" variant="ghost" onClick={clearFilters}>Clear filters</Button><Button type="submit"><Search size={14} /> Show conversations</Button></footer>
          </form>
        )}

        {error && <p className="rental-alert error" role="alert"><CircleAlert size={15} /> {error}</p>}

        <section className="conversation-workspace">
          <aside className="conversation-list" aria-label="Conversation list">
            <header>
              <span><b>All conversations</b><small>{result?.total ?? 0} total</small></span>
              {activeFilters > 0 && <button type="button" onClick={clearFilters}>Clear filter</button>}
            </header>
            {result?.items.length ? (
              <div>
                {result.items.map((item) => {
                  const tenant = tenantName(item);
                  const lastMessage = item.messages[item.messages.length - 1];
                  const pending = hasPendingQuestion(item);
                  return (
                    <button key={item.id} type="button" className={item.id === selected ? "selected" : ""} onClick={() => setSelected(item.id)}>
                      <i>{initials(tenant)}</i>
                      <span>
                        <b>{item.listing?.title ?? "Property conversation"}</b>
                        <small>{tenant}</small>
                        <p>{lastMessage ? `${messageAuthor(lastMessage)}: ${lastMessage.body}` : "No messages yet"}</p>
                      </span>
                      <em><time>{relativeTime(item.lastMessageAt ?? item.updatedAt)}</time>{pending ? <Status tone="gold">Reply needed</Status> : item.escalations.length ? <Status>Answered</Status> : <ChevronRight size={15} />}</em>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="conversation-list-empty"><MessageCircle size={22} /><b>No conversations found</b><p>Try adjusting or clearing your filters.</p></div>
            )}
            <footer>
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}><ArrowLeft size={14} /> Previous</Button>
              <span>Page {page}</span>
              <Button variant="outline" disabled={!result || page * 20 >= result.total} onClick={() => setPage(page + 1)}>Next <ArrowRight size={14} /></Button>
            </footer>
          </aside>

          <section className="conversation-reader" aria-live="polite">
            {conversation ? <ConversationReader conversation={conversation} contacts={result?.contacts ?? []} /> : <div className="conversation-reader-empty"><MessageCircle size={28} /><h2>Choose a conversation</h2><p>Select an item from the list to see the conversation and any question sent to the property contact.</p></div>}
          </section>
        </section>

        <p className="conversation-monitor-note"><CircleAlert size={14} /> This is a monitoring view. The property contact replies to forwarded questions from their own Questions inbox.</p>
      </main>
    </Shell>
  );
}

function ConversationReader({ conversation, contacts }: { conversation: Conversation; contacts: Result["contacts"] }) {
  const tenant = tenantName(conversation);
  const pending = conversation.escalations.filter((entry) => !entry.respondedAt);
  return <>
    <header className="conversation-reader-heading">
      <span>
        <small>Conversation about</small>
        <h2>{conversation.listing?.title ?? "Property conversation"}</h2>
        <p><UserRound size={13} /> Tenant: <b>{tenant}</b> <i /> Updated {relativeTime(conversation.lastMessageAt ?? conversation.updatedAt)}</p>
      </span>
      {pending.length ? <Status tone="gold"><CircleAlert size={12} /> {pending.length} reply needed</Status> : <Status><CheckCircle2 size={12} /> Up to date</Status>}
    </header>

    <div className="conversation-reader-body">
      <section className="conversation-transcript">
        <header><span><MessageCircle size={15} /><b>Conversation transcript</b></span><small>{conversation.messages.length} messages</small></header>
        <div>
          {conversation.messages.length ? conversation.messages.map((message) => {
            const Icon = messageIcon(message);
            return <article key={message.id} className={`conversation-message ${message.kind.toLowerCase()}`}>
              <i><Icon size={14} /></i>
              <span><header><b>{messageAuthor(message)}</b><time>{new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.createdAt))}</time></header><p>{message.body}</p></span>
            </article>;
          }) : <p className="conversation-no-messages">This conversation has no messages yet.</p>}
        </div>
      </section>

      <aside className="conversation-questions">
        <header><span><Send size={15} /><b>Forwarded questions</b></span><small>Sent to the property contact when the listing could not answer.</small></header>
        {conversation.escalations.length ? conversation.escalations.map((entry) => {
          const contact = contacts.find((item) => item.id === entry.contactId);
          const answered = Boolean(entry.respondedAt);
          return <article key={entry.id} className={answered ? "answered" : "waiting"}>
            <Status tone={answered ? "green" : "gold"}>{answered ? <CheckCircle2 size={11} /> : <CircleAlert size={11} />}{answered ? "Answered" : "Awaiting reply"}</Status>
            <small>Sent to {personName(contact)}</small>
            <h3>Tenant’s question</h3>
            <p>{entry.question}</p>
            {entry.response ? <><h3>Property contact’s answer</h3><p>{entry.response}</p></> : <p className="conversation-awaiting">The property contact has not replied yet.</p>}
          </article>;
        }) : <div className="conversation-no-questions"><CheckCircle2 size={19} /><b>No forwarded questions</b><p>The assistant answered this conversation using the listing details.</p></div>}
      </aside>
    </div>
  </>;
}
