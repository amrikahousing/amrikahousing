"use client";

import { useMemo, useState } from "react";

type Message = {
  id: string;
  sender: "manager" | "me";
  body: string;
  sentAt: string;
};

type Props = {
  initialMessages: Message[];
  managerName: string;
  organizationName: string | null;
  emergencyPhone: string | null;
  managerPhone: string | null;
  managerEmail: string | null;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function MessagesClient({
  initialMessages,
  managerName,
  organizationName,
  emergencyPhone,
  managerPhone,
  managerEmail,
}: Props) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState(initialMessages);

  const managerLabel = useMemo(
    () => managerName || organizationName || "Property Manager",
    [managerName, organizationName],
  );

  function handleSend() {
    const value = draft.trim();
    if (!value) return;

    setMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        sender: "me",
        body: value,
        sentAt: new Date().toISOString(),
      },
    ]);
    setDraft("");
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Messages</h1>
        <p className="mt-1 text-slate-500">Communicate with your property manager.</p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[280px_1fr]">
        <aside className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <h2 className="font-semibold text-slate-900">Conversations</h2>
          </div>
          <div className="p-3">
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900">
              <p className="text-sm font-semibold">{managerLabel}</p>
              <p className="text-xs text-emerald-700">
                {organizationName ? `${organizationName} support` : "Property management"}
              </p>
              <p className="mt-2 text-xs text-emerald-700">{messages.length} messages in this thread</p>
            </div>
          </div>
        </aside>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5">
            <p className="font-semibold text-slate-900">{managerLabel}</p>
            <p className="text-sm text-slate-500">{organizationName ?? "Property Manager"}</p>
          </div>

          <div className="space-y-4 p-5">
            {messages.map((message) => (
              <div
                key={message.id}
                className={[
                  "flex",
                  message.sender === "me" ? "justify-end" : "justify-start",
                ].join(" ")}
              >
                <div
                  className={[
                    "max-w-xl rounded-2xl px-4 py-3 shadow-sm",
                    message.sender === "me"
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-100 text-slate-900",
                  ].join(" ")}
                >
                  <p className="text-sm leading-6">{message.body}</p>
                  <p
                    className={[
                      "mt-2 text-xs",
                      message.sender === "me" ? "text-emerald-50/90" : "text-slate-500",
                    ].join(" ")}
                  >
                    {formatDateTime(message.sentAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 p-5">
            <div className="flex gap-3">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type your message..."
                className="h-11 flex-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!draft.trim()}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Send
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Messages entered here stay in the current session for now.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-900">Quick Contact</h2>
        <p className="mt-1 text-sm text-slate-500">Emergency and general contacts.</p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-rose-100 bg-rose-50 p-5">
            <p className="text-sm font-semibold text-slate-900">Emergency Maintenance</p>
            <p className="mt-1 text-sm text-slate-500">
              Available 24/7 for urgent issues like flooding, gas leaks, or security concerns.
            </p>
            <a
              href={emergencyPhone ? `tel:${emergencyPhone}` : `mailto:${managerEmail ?? ""}`}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-rose-200 transition-colors hover:bg-rose-100"
            >
              {emergencyPhone ? `Call ${emergencyPhone}` : "Email emergency support"}
            </a>
          </article>

          <article className="rounded-xl border border-sky-100 bg-sky-50 p-5">
            <p className="text-sm font-semibold text-slate-900">Property Manager</p>
            <p className="mt-1 text-sm text-slate-500">
              Mon-Fri, 9am-5pm for general questions and non-urgent requests.
            </p>
            <a
              href={managerPhone ? `tel:${managerPhone}` : `mailto:${managerEmail ?? ""}`}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-sky-200 transition-colors hover:bg-sky-100"
            >
              {managerPhone ? `Call ${managerPhone}` : "Email manager"}
            </a>
          </article>
        </div>
      </section>
    </div>
  );
}
