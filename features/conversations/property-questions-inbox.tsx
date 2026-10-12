"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  ArrowLeft,
  CircleAlert,
  LoaderCircle,
  MessageCircle,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { Shell, type Navigate } from "@/features/app/shell";
import {
  api,
  type ApiConversation,
  type ApiMessage,
} from "@/lib/api";
import "./property-assistant.css";

function realtimeUrl(): string {
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (configured) return configured.replace(/\/$/, "");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
  return new URL(apiUrl).origin;
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function appendMessage(messages: ApiMessage[], message: ApiMessage): ApiMessage[] {
  return messages.some((current) => current.id === message.id)
    ? messages
    : [...messages, message].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function PropertyQuestionsInbox({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const [conversations, setConversations] = useState<ApiConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [remoteTyping, setRemoteTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  );
  const tenant = activeConversation?.members.find((member) => member.userId !== session?.user.id)?.user ?? null;
  const tenantName = tenant ? `${tenant.firstName} ${tenant.lastName}` : "Tenant";

  const loadConversations = async (keepSelection = true) => {
    if (!session) return;
    const response = await api.conversations.list(session.accessToken, { pageSize: 100 });
    const enquiries = response.items.filter((conversation) => conversation.type === "LISTING_ENQUIRY");
    setConversations(enquiries);
    if (!keepSelection || !activeConversationIdRef.current || !enquiries.some((item) => item.id === activeConversationIdRef.current)) {
      setActiveConversationId(enquiries[0]?.id ?? null);
    }
  };

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setError(null);
    loadConversations(false)
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load property questions.");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  // The session is the only state that should reload this inbox.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (!session || !activeConversationId) {
      setMessages([]);
      return;
    }
    let active = true;
    api.conversations.messages(session.accessToken, activeConversationId, { pageSize: 100 })
      .then((response) => {
        if (!active) return;
        setMessages(response.items);
        void api.conversations.markRead(session.accessToken, activeConversationId);
      })
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : "Unable to load this conversation."));
    return () => {
      active = false;
    };
  }, [activeConversationId, session]);

  useEffect(() => {
    if (!session) return;
    const socket = io(`${realtimeUrl()}/realtime`, {
      auth: { token: session.accessToken },
      transports: ["websocket"],
    });
    socketRef.current = socket;
    socket.on("message:created", (message: ApiMessage) => {
      if (message.conversationId === activeConversationIdRef.current) {
        setMessages((current) => appendMessage(current, message));
        if (message.senderId !== session.user.id) {
          void api.conversations.markRead(session.accessToken, message.conversationId);
        }
      }
      void loadConversations();
    });
    socket.on("conversation:typing", (event: { conversationId?: string; userId?: string; isTyping?: boolean }) => {
      if (event.conversationId === activeConversationIdRef.current && event.userId !== session.user.id) {
        setRemoteTyping(Boolean(event.isTyping));
      }
    });
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socket.disconnect();
      socketRef.current = null;
    };
  // The authenticated socket is recreated only for a different session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const notifyTyping = () => {
    if (!activeConversationId) return;
    socketRef.current?.emit("conversation:typing", { conversationId: activeConversationId, isTyping: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit("conversation:typing", { conversationId: activeConversationId, isTyping: false });
    }, 700);
  };

  const send = async () => {
    if (!session || !activeConversationId || !draft.trim() || sending) return;
    const body = draft.trim();
    setSending(true);
    setError(null);
    setDraft("");
    try {
      const message = await api.conversations.sendMessage(session.accessToken, activeConversationId, body);
      setMessages((current) => appendMessage(current, message));
      await loadConversations();
    } catch (cause) {
      setDraft(body);
      setError(cause instanceof Error ? cause.message : "Your reply could not be sent.");
    } finally {
      setSending(false);
    }
  };

  if (!session) return null;

  return <Shell go={go} role="landlord" title="Property questions">
    <div className="page property-assistant-live">
      <div className="page-title">
        <span>
          <small>Tenant enquiries</small>
          <h1>Property questions</h1>
          <p>Questions not covered by a listing are delivered here for you to answer directly.</p>
        </span>
        <Button variant="outline" onClick={() => go("landlord-homes")}><ArrowLeft size={14} /> My homes</Button>
      </div>

      <section className="live-assistant">
        <aside className="live-conversation-list">
          <b>Enquiries</b>
          {conversations.length ? conversations.map((conversation) => {
            const sender = conversation.members.find((member) => member.userId !== session.user.id)?.user;
            const name = sender ? `${sender.firstName} ${sender.lastName}` : "Tenant";
            return <button key={conversation.id} type="button" className={conversation.id === activeConversationId ? "active" : undefined} onClick={() => setActiveConversationId(conversation.id)}>
              <i><MessageCircle size={15} /></i>
              <span><strong>{conversation.listing?.title ?? "Property enquiry"}</strong><small>{name}</small></span>
              {conversation.unreadCount ? <em>{conversation.unreadCount}</em> : null}
            </button>;
          }) : <p>No tenant questions yet.</p>}
        </aside>

        <div className="live-message-panel">
          <header>
            <i><MessageCircle size={16} /></i>
            <span><b>{activeConversation?.listing?.title ?? "Property enquiry"}</b><small>{activeConversation ? `Conversation with ${tenantName}` : "Choose an enquiry to reply"}</small></span>
          </header>
          <div className="live-messages" aria-live="polite">
            {loading ? <p className="conversation-state"><LoaderCircle className="spin" size={17} /> Loading property questions…</p> : error ? <p className="conversation-state error"><CircleAlert size={17} /> {error}</p> : messages.length ? messages.map((message) => {
              const fromCurrentUser = message.senderId === session.user.id;
              const sender = fromCurrentUser ? "You" : message.sender ? `${message.sender.firstName} ${message.sender.lastName}` : "SingleRent";
              return <article key={message.id} className={`live-message ${fromCurrentUser ? "mine" : ""}`}><span>{sender}</span><p>{message.body}</p><time>{formatTime(message.createdAt)}</time></article>;
            }) : <div className="conversation-empty"><MessageCircle size={21} /><h2>No question selected</h2><p>When a tenant asks something not included in a listing, their exact question will appear here.</p></div>}
            {remoteTyping && <p className="typing-indicator">{tenantName} is typing…</p>}
          </div>
          <form className="live-compose" onSubmit={(event) => { event.preventDefault(); void send(); }}>
            <input value={draft} onChange={(event) => { setDraft(event.target.value); notifyTyping(); }} placeholder={activeConversationId ? `Reply to ${tenantName}…` : "Choose an enquiry first"} maxLength={5000} disabled={!activeConversationId || sending} />
            <Button size="icon" type="submit" disabled={!activeConversationId || !draft.trim() || sending} aria-label="Send reply">{sending ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}</Button>
          </form>
        </div>
      </section>
    </div>
  </Shell>;
}
