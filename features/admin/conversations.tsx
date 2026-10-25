"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppNavigation, useAppSession } from "@/features/app/app-provider";
import { Shell } from "@/features/app/shell";
import { api } from "@/lib/api";

type Result = Awaited<ReturnType<typeof api.conversations.monitoring>>;
const emptyFilters = { property: "", tenant: "", contact: "", from: "", to: "", status: "" };

export function AdminConversationsPage() {
  const { go } = useAppNavigation();
  const { session } = useAppSession();
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!session) return;
    const data = await api.conversations.monitoring(session.accessToken, { ...applied, page });
    setResult(data);
    setSelected((current) => data.items.some((item) => item.id === current) ? current : data.items[0]?.id ?? null);
  }, [session, applied, page]);
  useEffect(() => { void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Unable to load conversations.")); }, [load]);
  const conversation = result?.items.find((item) => item.id === selected);
  if (!session) return null;
  return <Shell go={go} role="admin" title="Conversations">
    <main className="page">
      <div className="page-title"><span><small>Monitoring</small><h1>Conversations</h1><p>Review assistant conversations and questions forwarded to property contacts.</p></span></div>
      <form className="formgrid" onSubmit={(event) => { event.preventDefault(); setError(""); setPage(1); setApplied(filters); }}>
        {(["property", "tenant", "contact"] as const).map((name) => <label key={name}>{name === "contact" ? "Landlord or agent" : name === "tenant" ? "Tenant" : "Property"}<input value={filters[name]} onChange={(event) => setFilters({ ...filters, [name]: event.target.value })} /></label>)}
        <label>From<input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
        <label>To<input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
        <label>Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All</option><option value="pending">Awaiting property contact</option><option value="answered">Answered</option></select></label>
        <Button type="submit">Apply filters</Button>
      </form>
      {error && <p role="alert">{error}</p>}
      <p>{result?.total ?? 0} conversations</p>
      <div className="two-col">
        <section>{result?.items.map((item) => <p key={item.id}><button type="button" onClick={() => setSelected(item.id)}><b>{item.listing?.title ?? "Property"}</b> — {item.members.map((member) => member.user ? `${member.user.firstName} ${member.user.lastName}` : "Tenant").join(", ")} {item.escalations.some((entry) => !entry.respondedAt) ? "(awaiting answer)" : ""}</button></p>)}
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>{" "}
          <Button variant="outline" disabled={!result || page * 20 >= result.total} onClick={() => setPage(page + 1)}>Next</Button>
        </section>
        <section>{conversation ? <>
          <h2>{conversation.listing?.title ?? "Property conversation"}</h2>
          <h3>Conversation history</h3>
          {conversation.messages.map((message) => <p key={message.id}><b>{message.kind === "AI" ? "Property Assistant" : message.kind === "SYSTEM" ? "System" : "Tenant"}</b>: {message.body}<br /><small>{new Date(message.createdAt).toLocaleString()}</small></p>)}
          <h3>Forwarded questions</h3>
          {conversation.escalations.length ? conversation.escalations.map((entry) => { const contact = result?.contacts.find((item) => item.id === entry.contactId); return <p key={entry.id}><b>{entry.respondedAt ? "Answered" : "Awaiting response"}</b> · {contact ? `${contact.firstName} ${contact.lastName}` : "Property contact"}<br />Question: {entry.question}<br />{entry.response ? `Response: ${entry.response}` : "No response yet"}</p>; }) : <p>No forwarded questions.</p>}
        </> : <p>Select a conversation.</p>}</section>
      </div>
    </main>
  </Shell>;
}
