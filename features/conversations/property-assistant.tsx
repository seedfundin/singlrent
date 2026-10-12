"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import {
  ArrowLeft,
  CircleAlert,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSession } from "@/features/app/app-provider";
import { Shell, type Navigate } from "@/features/app/shell";
import {
  api,
  type ApiConversation,
  type ApiConversationType,
  type ApiListing,
  type ApiMessage,
} from "@/lib/api";
import "./property-assistant.css";

type AssistantMode = "ai" | "landlord";

function realtimeUrl(): string {
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (configured) return configured.replace(/\/$/, "");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
  return new URL(apiUrl).origin;
}

function conversationMode(type: ApiConversationType): AssistantMode {
  return type === "PROPERTY_AI" ? "ai" : "landlord";
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function appendMessage(messages: ApiMessage[], message: ApiMessage): ApiMessage[] {
  return messages.some((current) => current.id === message.id)
    ? messages
    : [...messages, message].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function PropertyAssistant({ go }: { go: Navigate }) {
  const { session } = useAppSession();
  const searchParams = useSearchParams();
  const listingId = searchParams.get("listing");
  const requestedMode: AssistantMode = searchParams.get("mode") === "landlord" ? "landlord" : "ai";
  const role = session?.user.roles.includes("LANDLORD")
    ? "landlord"
    : session?.user.roles.includes("AGENT")
      ? "agent"
      : "tenant";
  const [listing, setListing] = useState<ApiListing | null>(null);
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
  const activeMode = activeConversation ? conversationMode(activeConversation.type) : requestedMode;
  const activeListing = listing ?? null;

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setError(null);
    const listingRequest = listingId ? api.listings.detail(listingId) : Promise.resolve(null);
    Promise.all([api.conversations.list(session.accessToken, { pageSize: 50 }), listingRequest])
      .then(([conversationResponse, property]) => {
        if (!active) return;
        setConversations(conversationResponse.items);
        setListing(property);
        const expectedType: ApiConversationType = requestedMode === "ai" ? "PROPERTY_AI" : "LISTING_ENQUIRY";
        const related = listingId
          ? conversationResponse.items.find((conversation) => conversation.listingId === listingId && conversation.type === expectedType)
          : conversationResponse.items[0];
        setActiveConversationId(related?.id ?? null);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load your conversations.");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [listingId, requestedMode, session]);

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
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : "Unable to load messages."));
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
      if (message.conversationId !== activeConversationIdRef.current) return;
      setMessages((current) => appendMessage(current, message));
      if (message.senderId !== session.user.id) {
        void api.conversations.markRead(session.accessToken, message.conversationId);
      }
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
  }, [session]);

  const notifyTyping = () => {
    if (!activeConversationId || activeMode === "ai") return;
    socketRef.current?.emit("conversation:typing", { conversationId: activeConversationId, isTyping: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit("conversation:typing", { conversationId: activeConversationId, isTyping: false });
    }, 700);
  };

  const createConversation = async (body: string): Promise<ApiConversation> => {
    if (!session || !listing) throw new Error("Choose a property before starting a conversation.");
    if (requestedMode === "ai") {
      return api.conversations.create(session.accessToken, {
        listingId: listing.id,
        type: "PROPERTY_AI",
        initialMessage: body,
      });
    }
    const recipient = listing.managingAgent ?? listing.landlord;
    return api.conversations.create(session.accessToken, {
      listingId: listing.id,
      recipientId: recipient.id,
      type: "LISTING_ENQUIRY",
      subject: `Question about ${listing.title}`,
      initialMessage: body,
    });
  };

  const send = async () => {
    if (!session || !draft.trim() || sending) return;
    const body = draft.trim();
    setSending(true);
    setError(null);
    setDraft("");
    try {
      if (!activeConversationId) {
        const created = await createConversation(body);
        setConversations((current) => [created, ...current.filter((conversation) => conversation.id !== created.id)]);
        setActiveConversationId(created.id);
        const response = await api.conversations.messages(session.accessToken, created.id, { pageSize: 100 });
        setMessages(response.items);
        if (requestedMode === "ai") {
          const refreshed = await api.conversations.list(session.accessToken, { pageSize: 50 });
          setConversations(refreshed.items);
        }
      } else {
        const message = await api.conversations.sendMessage(session.accessToken, activeConversationId, body);
        setMessages((current) => appendMessage(current, message));
        if (activeMode === "ai") {
          const response = await api.conversations.messages(session.accessToken, activeConversationId, { pageSize: 100 });
          setMessages(response.items);
          const refreshed = await api.conversations.list(session.accessToken, { pageSize: 50 });
          setConversations(refreshed.items);
        }
      }
    } catch (cause) {
      setDraft(body);
      setError(cause instanceof Error ? cause.message : "Your message could not be sent.");
    } finally {
      setSending(false);
    }
  };

  if (!session) return null;

  const title = activeListing?.title ?? activeConversation?.listing?.title ?? "Property conversations";
  const location = activeListing ? `${activeListing.area}, ${activeListing.state}` : null;

  return <Shell go={go} role={role} title="Messages">
    <div className="page property-assistant-live">
      <div className="page-title">
        <span>
          <small>{activeMode === "ai" ? "Property assistant" : "Landlord conversation"}</small>
          <h1>{title}</h1>
          {location && <p><MapPin size={14} /> {location}</p>}
        </span>
        <Button variant="outline" onClick={() => go("explore")}><ArrowLeft size={14} /> Back to homes</Button>
      </div>

      <section className="live-assistant">
        <aside className="live-conversation-list">
          <b>Conversations</b>
          {conversations.length ? conversations.map((conversation) => {
            const otherMember = conversation.members.find((member) => member.userId !== session.user.id);
            const label = conversation.type === "PROPERTY_AI" ? "Property assistant" : otherMember ? `${otherMember.user.firstName} ${otherMember.user.lastName}` : "Property conversation";
            return <button key={conversation.id} type="button" className={conversation.id === activeConversationId ? "active" : undefined} onClick={() => setActiveConversationId(conversation.id)}>
              <i>{conversation.type === "PROPERTY_AI" ? <Sparkles size={15} /> : <MessageCircle size={15} />}</i>
              <span><strong>{conversation.listing?.title ?? label}</strong><small>{label}</small></span>
              {conversation.unreadCount ? <em>{conversation.unreadCount}</em> : null}
            </button>;
          }) : <p>No conversations yet.</p>}
        </aside>

        <div className="live-message-panel">
          <header>
            <i>{activeMode === "ai" ? <Sparkles size={16} /> : <MessageCircle size={16} />}</i>
            <span><b>{activeMode === "ai" ? "Property assistant" : "Ask the landlord"}</b><small>{activeMode === "ai" ? "Checks this listing first, then forwards unanswered questions" : "Messages are sent directly to the property contact"}</small></span>
          </header>
          <div className="live-messages" aria-live="polite">
            {loading ? <p className="conversation-state"><LoaderCircle className="spin" size={17} /> Loading conversations…</p> : error ? <p className="conversation-state error"><CircleAlert size={17} /> {error}</p> : messages.length ? messages.map((message) => {
              const fromCurrentUser = message.senderId === session.user.id;
              const isAi = message.kind === "AI";
              return <article key={message.id} className={`live-message ${fromCurrentUser ? "mine" : ""} ${isAi ? "ai" : ""}`}><span>{isAi ? "Property assistant" : fromCurrentUser ? "You" : message.sender ? `${message.sender.firstName} ${message.sender.lastName}` : "SingleRent"}</span><p>{message.body}</p><time>{formatTime(message.createdAt)}</time></article>;
            }) : <div className="conversation-empty"><Sparkles size={21} /><h2>{activeMode === "ai" ? "Ask about this home" : "Start a conversation"}</h2><p>{activeMode === "ai" ? "The assistant checks the listing first. If the answer is not listed, it sends your question to the landlord or managing agent." : "Ask the landlord or managing agent about this listing before applying."}</p></div>}
            {remoteTyping && <p className="typing-indicator">The landlord is typing…</p>}
          </div>
          <form className="live-compose" onSubmit={(event) => { event.preventDefault(); void send(); }}>
            <input value={draft} onChange={(event) => { setDraft(event.target.value); notifyTyping(); }} placeholder={activeMode === "ai" ? "Ask about this home…" : "Write a message…"} maxLength={5000} disabled={sending || (!listing && !activeConversationId)} />
            <Button size="icon" type="submit" disabled={!draft.trim() || sending || (!listing && !activeConversationId)} aria-label="Send message">{sending ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}</Button>
          </form>
        </div>
      </section>
    </div>
  </Shell>;
}
