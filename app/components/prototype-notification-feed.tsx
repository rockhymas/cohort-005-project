// PROTOTYPE: "What does the Notification Feed look like in Cadence?"
// (https://github.com/rockhymas/cohort-005-project/issues/30). Never merge to main.
//
// Three structurally different Notification Feeds mounted in the real app shell,
// switchable via ?variant=A|B|C (or ← / → keys):
//   A  Bell + popover   — bell in the sidebar header, badge = UNSEEN, opening marks all seen
//   B  Feed page        — "Notifications" nav item, badge = UNREAD, full page at /notifications
//   C  Activity rail    — always-on right-hand column, collapsible, badge = UNREAD
//
// All data is the REAL Knock feed for the DevUI-selected user, read in the browser
// with the public key + a server-signed user token. Rows are rendered by Cadence from
// the message `data` (Knock's rendered blocks are ignored). "Send samples" in the
// switcher bar triggers one of each of the 7 catalogue Notifications to you.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { NavLink, useNavigate, useFetcher } from "react-router";
import {
  Bell,
  BadgeCheck,
  BadgeX,
  Receipt,
  UserPlus,
  GraduationCap,
  MessageCircleQuestion,
  MessageSquareReply,
  CheckCheck,
  ChevronRight,
  ChevronLeft,
  Circle,
  CircleDot,
} from "lucide-react";
import { cn } from "~/lib/utils";

const KNOCK_API = "https://api.knock.app/v1";

export type FeedEntry = {
  id: string;
  inserted_at: string;
  read_at: string | null;
  seen_at: string | null;
  data: Record<string, any>;
};
type FeedMeta = { unread_count: number; unseen_count: number; total_count: number };

type FeedCtx = {
  entries: FeedEntry[];
  meta: FeedMeta;
  loading: boolean;
  refresh: () => Promise<void>;
  markSeen: (ids?: string[]) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markUnread: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const Ctx = createContext<FeedCtx | null>(null);
export const useFeed = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFeed outside FeedProvider");
  return c;
};

export function FeedProvider({
  knock,
  children,
}: {
  knock: { userId: string; token: string; publicKey: string; channelId: string } | null;
  children: ReactNode;
}) {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [meta, setMeta] = useState<FeedMeta>({ unread_count: 0, unseen_count: 0, total_count: 0 });
  const [loading, setLoading] = useState(true);

  const call = useCallback(
    async (method: string, path: string, body?: unknown) => {
      if (!knock) return null;
      const res = await fetch(`${KNOCK_API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${knock.publicKey}`,
          "X-Knock-User-Token": knock.token,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return res.ok ? res.json().catch(() => null) : null;
    },
    [knock?.publicKey, knock?.token]
  );

  const refresh = useCallback(async () => {
    if (!knock) return;
    const json = await call("GET", `/users/${knock.userId}/feeds/${knock.channelId}?page_size=50`);
    setEntries(json?.entries ?? []);
    setMeta(json?.meta ?? { unread_count: 0, unseen_count: 0, total_count: 0 });
    setLoading(false);
  }, [call, knock?.userId, knock?.channelId]);

  useEffect(() => {
    setEntries([]);
    setLoading(true);
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  const batch = async (status: "seen" | "read" | "unread", ids: string[]) => {
    if (ids.length === 0) return; // Knock 422s on an empty batch
    await call("POST", `/messages/batch/${status}`, { message_ids: ids });
    await refresh();
  };

  const value: FeedCtx = {
    entries,
    meta,
    loading,
    refresh,
    markSeen: (ids) => batch("seen", ids ?? entries.filter((e) => !e.seen_at).map((e) => e.id)),
    markRead: (id) => batch("read", [id]),
    markUnread: (id) => batch("unread", [id]),
    markAllRead: () => batch("read", entries.filter((e) => !e.read_at).map((e) => e.id)),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ── What a row says, per catalogue entry (shared content, not shared layout) ──

type Described = {
  icon: ReactNode;
  tone: string;
  actor: string;
  headline: string;
  detail?: string;
  quote?: string;
  cta?: string;
  link: string;
};

export function describe(e: FeedEntry): Described {
  const d = e.data ?? {};
  const s = "size-4";
  switch (d.kind) {
    case "refund_approved":
      return { icon: <BadgeCheck className={s} />, tone: "text-emerald-600 bg-emerald-500/10", actor: "Cadence",
        headline: `Your Refund Request for ${d.courseTitle} was approved`,
        detail: `${d.amount} will be refunded. Your Enrollment has ended.`, quote: d.note, link: d.link };
    case "refund_declined":
      return { icon: <BadgeX className={s} />, tone: "text-rose-600 bg-rose-500/10", actor: "Cadence",
        headline: `Your Refund Request for ${d.courseTitle} was declined`,
        detail: "You can make a new Refund Request.", quote: d.note, cta: "View course", link: d.link };
    case "refund_requested":
      return { icon: <Receipt className={s} />, tone: "text-amber-600 bg-amber-500/10", actor: d.actorName,
        headline: `${d.actorName} asked for a Refund on ${d.courseTitle}`,
        detail: `${d.amount} · Open Refund Request`, quote: d.reason, cta: "Review", link: d.link };
    case "seat_claimed":
      return { icon: <UserPlus className={s} />, tone: "text-sky-600 bg-sky-500/10", actor: d.actorName,
        headline: `${d.actorName} claimed a Seat on ${d.courseTitle}`,
        detail: `${d.seatsLeft} Seats left`, link: d.link };
    case "enrollment":
      return { icon: <GraduationCap className={s} />, tone: "text-violet-600 bg-violet-500/10", actor: d.actorName,
        headline: `${d.actorName} enrolled in ${d.courseTitle}`, link: d.link };
    case "discussion_question":
      return { icon: <MessageCircleQuestion className={s} />, tone: "text-indigo-600 bg-indigo-500/10", actor: d.actorName,
        headline: `${d.actorName} asked a question on ${d.lessonTitle}`,
        detail: d.courseTitle, quote: d.snippet, cta: "Answer", link: d.link };
    case "discussion_reply":
      return { icon: <MessageSquareReply className={s} />, tone: "text-indigo-600 bg-indigo-500/10", actor: d.actorName,
        headline: `${d.actorName} replied to your question on ${d.lessonTitle}`,
        detail: d.courseTitle, quote: d.snippet, cta: "View reply", link: d.link };
    default:
      return { icon: <Bell className={s} />, tone: "text-muted-foreground bg-muted", actor: "Cadence",
        headline: "Notification (spike payload, no kind)", detail: JSON.stringify(d).slice(0, 80), link: "#" };
  }
}

function ago(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function useOpen() {
  const nav = useNavigate();
  const { markRead } = useFeed();
  return (e: FeedEntry, after?: () => void) => {
    if (!e.read_at) markRead(e.id);
    after?.();
    nav(describe(e).link);
  };
}

function CountBadge({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span className={cn("min-w-5 rounded-full bg-rose-600 px-1.5 text-center text-[11px] font-semibold leading-5 text-white", className)}>
      {n > 9 ? "9+" : n}
    </span>
  );
}

function Empty({ text = "You're all caught up." }: { text?: string }) {
  return <div className="px-4 py-10 text-center text-sm text-muted-foreground">{text}</div>;
}

// ── Variant A: bell + popover ────────────────────────────────────────────────

export function BellPopover() {
  const { entries, meta, markSeen, markAllRead } = useFeed();
  const open = useOpen();
  const [isOpen, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    markSeen();
    const onDown = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    };
    const onEsc = (ev: KeyboardEvent) => ev.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const shown = tab === "unread" ? entries.filter((e) => !e.read_at) : entries;

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-5" />
        <CountBadge n={meta.unseen_count} className="absolute -right-1.5 -top-1" />
      </button>
      {isOpen && (
        <div className="absolute left-full top-0 z-50 ml-3 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center border-b px-4 py-3">
            <span className="font-semibold">Notifications</span>
            <button onClick={markAllRead} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <CheckCheck className="size-3.5" /> Mark all as read
            </button>
          </div>
          <div className="flex gap-4 border-b px-4 text-sm">
            {(["all", "unread"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn("-mb-px border-b-2 py-2 capitalize", tab === t ? "border-primary font-medium" : "border-transparent text-muted-foreground")}>
                {t}{t === "unread" && meta.unread_count > 0 ? ` (${meta.unread_count})` : ""}
              </button>
            ))}
          </div>
          <ul className="max-h-[28rem] divide-y overflow-y-auto">
            {shown.length === 0 && <Empty />}
            {shown.map((e) => {
              const x = describe(e);
              return (
                <li key={e.id}>
                  <button onClick={() => open(e, () => setOpen(false))}
                    className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-accent", !e.read_at && "bg-primary/5")}>
                    <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", x.tone)}>{x.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm leading-snug", !e.read_at && "font-medium")}>{x.headline}</span>
                      {x.quote && <span className="mt-0.5 block truncate text-xs text-muted-foreground">“{x.quote}”</span>}
                      <span className="mt-1 block text-xs text-muted-foreground">{ago(e.inserted_at)}</span>
                    </span>
                    {!e.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t px-4 py-2 text-center text-xs text-muted-foreground">Showing your latest {entries.length}</div>
        </div>
      )}
    </div>
  );
}

// ── Variant B: nav item + full page ──────────────────────────────────────────

export function FeedNavItem() {
  const { meta } = useFeed();
  return (
    <NavLink to="/notifications"
      className={({ isActive }) => cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
      <Bell className="size-4" />
      Notifications
      <CountBadge n={meta.unread_count} className="ml-auto" />
    </NavLink>
  );
}

function dayGroup(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return "Earlier";
}

export function FeedPage() {
  const { entries, meta, loading, markSeen, markAllRead, markRead, markUnread } = useFeed();
  const open = useOpen();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    if (entries.some((e) => !e.seen_at)) markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  const shown = filter === "unread" ? entries.filter((e) => !e.read_at) : entries;
  const groups = ["Today", "Yesterday", "Earlier"].map((g) => [g, shown.filter((e) => dayGroup(e.inserted_at) === g)] as const);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">{meta.unread_count} unread of {meta.total_count}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border p-0.5 text-sm">
            {(["all", "unread"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn("rounded px-3 py-1 capitalize", filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{f}</button>
            ))}
          </div>
          <button onClick={markAllRead} className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            <CheckCheck className="size-4" /> Mark all read
          </button>
        </div>
      </div>
      {loading && <Empty text="Loading…" />}
      {!loading && shown.length === 0 && <Empty />}
      {groups.map(([g, list]) => list.length > 0 && (
        <section key={g} className="mb-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g}</h2>
          <ul className="space-y-2">
            {list.map((e) => {
              const x = describe(e);
              return (
                <li key={e.id} className={cn("group flex gap-4 rounded-lg border p-4", !e.read_at ? "border-primary/30 bg-primary/5" : "bg-card")}>
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", x.tone)}>{x.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className={cn("text-sm", !e.read_at && "font-semibold")}>{x.headline}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{ago(e.inserted_at)}</span>
                    </div>
                    {x.detail && <div className="mt-0.5 text-sm text-muted-foreground">{x.detail}</div>}
                    {x.quote && <blockquote className="mt-2 border-l-2 pl-3 text-sm italic text-muted-foreground">{x.quote}</blockquote>}
                    <div className="mt-3 flex items-center gap-3">
                      <button onClick={() => open(e)} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                        {x.cta ?? "Open"}
                      </button>
                      <button onClick={() => (e.read_at ? markUnread(e.id) : markRead(e.id))}
                        className="text-xs text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100">
                        Mark as {e.read_at ? "unread" : "read"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ── Variant C: always-on activity rail ──────────────────────────────────────

export function ActivityRail() {
  const { entries, meta, markSeen, markAllRead, markRead } = useFeed();
  const open = useOpen();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!collapsed && entries.some((e) => !e.seen_at)) markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, entries.length]);

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-3 border-l py-4">
        <button onClick={() => setCollapsed(false)} title="Show activity" className="rounded-md p-1.5 hover:bg-accent">
          <ChevronLeft className="size-4" />
        </button>
        <Bell className="size-4 text-muted-foreground" />
        <CountBadge n={meta.unread_count} />
      </aside>
    );
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l bg-muted/30">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <span className="font-semibold">Activity</span>
        <CountBadge n={meta.unread_count} />
        <button onClick={markAllRead} title="Mark all read" className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent">
          <CheckCheck className="size-4" />
        </button>
        <button onClick={() => setCollapsed(true)} title="Hide" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <ol className="relative flex-1 overflow-y-auto px-4 py-4">
        <span className="absolute bottom-4 left-[1.95rem] top-4 w-px bg-border" />
        {entries.length === 0 && <Empty />}
        {entries.map((e) => {
          const x = describe(e);
          return (
            <li key={e.id} className="relative mb-5 flex gap-3">
              <span className={cn("z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-4 ring-background", x.tone)}>{x.icon}</span>
              <div className="min-w-0 flex-1">
                <button onClick={() => open(e)} className={cn("text-left text-[13px] leading-snug hover:underline", e.read_at ? "text-muted-foreground" : "font-medium")}>
                  {x.headline}
                </button>
                {x.quote && <p className="mt-1 line-clamp-2 rounded bg-background px-2 py-1 text-xs text-muted-foreground">{x.quote}</p>}
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  {ago(e.inserted_at)}
                  {!e.read_at && (
                    <button onClick={() => markRead(e.id)} title="Mark read" className="hover:text-foreground">
                      <CircleDot className="size-3 text-primary" />
                    </button>
                  )}
                  {e.read_at && <Circle className="size-3" />}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

// ── "Send samples" button for the switcher bar ──────────────────────────────

export function SendSamples() {
  const fetcher = useFetcher();
  const { refresh } = useFeed();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) setTimeout(refresh, 2500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);
  return (
    <fetcher.Form method="post" action="/notifications" className="ml-2 border-l border-white/40 pl-2">
      <button name="intent" value="samples" className="underline disabled:opacity-50" disabled={fetcher.state !== "idle"}>
        {fetcher.state !== "idle" ? "sending…" : "send 7 samples to me"}
      </button>
    </fetcher.Form>
  );
}

export const FEED_VARIANTS = [
  { key: "A", name: "Bell + popover, badge = unseen" },
  { key: "B", name: "Feed page, badge = unread" },
  { key: "C", name: "Activity rail, badge = unread" },
];

