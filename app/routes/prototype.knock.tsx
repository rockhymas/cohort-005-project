// PROTOTYPE — throwaway Knock spike for "Does Knock hold up against Cadence?"
// (https://github.com/rockhymas/cohort-005-project/issues/22). Never merge to main.
//
// Run `npm run dev`, then open /prototype/knock. Switch users in the DevUI panel.
// The server signs a user token for the current user; every feed and preference
// call below runs in the browser with the public key + that token, the same way
// a production client would under enhanced security.

import { useCallback, useEffect, useState } from "react";
import { data, Form, useActionData } from "react-router";
import { Knock, signUserToken } from "@knocklabs/node";
import type { Route } from "./+types/prototype.knock";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { users } from "~/db/schema";
import { eq } from "drizzle-orm";

const KNOCK_API = "https://api.knock.app/v1";
const WORKFLOW_REPLY = "discussion-reply";
const WORKFLOW_ENROLLMENT = "new-enrollment";
const ENROLLMENT_CATEGORY = "enrollment";

function knock() {
  return new Knock({ apiKey: process.env.KNOCK_API_KEY });
}

async function requireUser(request: Request) {
  const id = await getCurrentUserId(request);
  if (!id) throw data("Select a user from the DevUI panel.", { status: 401 });
  const user = db.select().from(users).where(eq(users.id, id)).get();
  if (!user) throw data("User not found", { status: 404 });
  return user;
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  // Identify so the Knock user exists before the client reads its feed.
  await knock().users.update(String(user.id), {
    name: user.name,
    email: user.email,
  });
  const token = await signUserToken(String(user.id), {
    signingKey: process.env.KNOCK_SIGNING_KEY,
    expiresInSeconds: 60 * 60,
  });
  const allUsers = db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .all();
  return {
    user: { id: user.id, name: user.name, role: user.role },
    token,
    publicKey: process.env.KNOCK_PUBLIC_API_KEY!,
    channelId: process.env.KNOCK_FEED_CHANNEL_ID!,
    allUsers,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const actor = await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const recipientId = Number(form.get("recipientId"));
  const recipient = db
    .select()
    .from(users)
    .where(eq(users.id, recipientId))
    .get();
  if (!recipient) return { error: "Pick a recipient" };

  const workflow =
    intent === "enrollment" ? WORKFLOW_ENROLLMENT : WORKFLOW_REPLY;
  const payload =
    intent === "enrollment"
      ? { courseTitle: "Prototype Course", studentName: actor.name }
      : {
          courseTitle: "Prototype Course",
          questionTitle: "How do loaders work?",
          replyExcerpt: `${actor.name} replied at ${new Date().toLocaleTimeString()}`,
        };
  try {
    const result = await knock().workflows.trigger(workflow, {
      recipients: [
        {
          id: String(recipient.id),
          name: recipient.name,
          email: recipient.email,
        },
      ],
      actor: { id: String(actor.id), name: actor.name, email: actor.email },
      data: payload,
    });
    return { workflow, recipient: recipient.name, result };
  } catch (e) {
    return { workflow, error: String(e) };
  }
}

type FeedResponse = {
  entries: Array<{
    id: string;
    inserted_at: string;
    read_at: string | null;
    seen_at: string | null;
    source: { key: string; categories: string[] };
    data: Record<string, unknown>;
    blocks: Array<{ name: string; rendered?: string; content?: string }>;
  }>;
  meta: { unread_count: number; unseen_count: number; total_count: number };
};

export default function KnockPrototype({ loaderData }: Route.ComponentProps) {
  const { user, token, publicKey, channelId, allUsers } = loaderData;
  const actionData = useActionData<typeof action>();
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [prefs, setPrefs] = useState<unknown>(null);
  const [log, setLog] = useState<string[]>([]);

  const call = useCallback(
    async (method: string, path: string, body?: unknown) => {
      const res = await fetch(`${KNOCK_API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${publicKey}`,
          "X-Knock-User-Token": token,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => null);
      setLog((l) => [`${method} ${path} → ${res.status}`, ...l].slice(0, 20));
      return json;
    },
    [publicKey, token]
  );

  const userId = String(user.id);
  const loadFeed = useCallback(async () => {
    setFeed(await call("GET", `/users/${userId}/feeds/${channelId}`));
  }, [call, userId, channelId]);
  const loadPrefs = useCallback(async () => {
    setPrefs(await call("GET", `/users/${userId}/preferences/default`));
  }, [call, userId]);

  useEffect(() => {
    setFeed(null);
    setPrefs(null);
    loadFeed();
    loadPrefs();
  }, [loadFeed, loadPrefs, actionData]);

  const ids = feed?.entries?.map((e) => e.id) ?? [];
  const optIn = async (on: boolean) => {
    await call("PUT", `/users/${userId}/preferences/default`, {
      categories: { [ENROLLMENT_CATEGORY]: on },
    });
    loadPrefs();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 font-mono text-sm">
      <div className="rounded border-2 border-dashed border-amber-500 bg-amber-50 p-3">
        PROTOTYPE: Knock spike (issue #22). Viewing as{" "}
        <b>
          {user.name} (#{user.id}, {user.role})
        </b>
        . Feed and preference calls go straight from the browser to Knock
        using the public key and a server-signed token.
      </div>

      <section className="space-y-2">
        <h2 className="font-bold">2 · Trigger (Node SDK, server)</h2>
        <Form method="post" className="flex flex-wrap gap-2">
          <select name="recipientId" className="border p-1">
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>
                #{u.id} {u.name} ({u.role})
              </option>
            ))}
          </select>
          <button name="intent" value="reply" className="border px-2">
            Discussion Reply → recipient
          </button>
          <button name="intent" value="enrollment" className="border px-2">
            New Enrollment → recipient
          </button>
        </Form>
        {actionData && (
          <pre className="bg-gray-100 p-2">
            {JSON.stringify(actionData, null, 2)}
          </pre>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">1 + 3 · Feed (headless API, signed token)</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={loadFeed} className="border px-2">
            Refresh
          </button>
          <button
            onClick={async () => {
              await call("POST", `/messages/batch/seen`, { message_ids: ids });
              loadFeed();
            }}
            className="border px-2"
          >
            Mark all seen
          </button>
          <button
            onClick={async () => {
              await call("POST", `/messages/batch/read`, { message_ids: ids });
              loadFeed();
            }}
            className="border px-2"
          >
            Mark all read
          </button>
          <button
            onClick={async () => {
              await call("POST", `/messages/batch/unread`, {
                message_ids: ids,
              });
              loadFeed();
            }}
            className="border px-2"
          >
            Mark all unread
          </button>
        </div>
        <div>
          unread_count: <b>{feed?.meta?.unread_count ?? "?"}</b> · unseen_count:{" "}
          <b>{feed?.meta?.unseen_count ?? "?"}</b> · total:{" "}
          {feed?.meta?.total_count ?? "?"}
        </div>
        <ul className="space-y-1">
          {feed?.entries?.map((e) => (
            <li key={e.id} className="flex gap-2 border p-2">
              <span>{e.read_at ? "○" : "●"}</span>
              <span className="flex-1">
                [{e.source.key}] {JSON.stringify(e.data)}
                <br />
                seen: {e.seen_at ?? "—"} · read: {e.read_at ?? "—"}
              </span>
              <button
                className="border px-2"
                onClick={async () => {
                  await call("PUT", `/messages/${e.id}/read`);
                  loadFeed();
                }}
              >
                read
              </button>
            </li>
          ))}
        </ul>
        <details>
          <summary>raw feed</summary>
          <pre className="bg-gray-100 p-2">{JSON.stringify(feed, null, 2)}</pre>
        </details>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">4 · Preferences (category × channel)</h2>
        <div className="flex gap-2">
          <button onClick={() => optIn(true)} className="border px-2">
            Opt in to “{ENROLLMENT_CATEGORY}”
          </button>
          <button onClick={() => optIn(false)} className="border px-2">
            Opt out of “{ENROLLMENT_CATEGORY}”
          </button>
          <button onClick={loadPrefs} className="border px-2">
            Refresh
          </button>
        </div>
        <pre className="bg-gray-100 p-2">{JSON.stringify(prefs, null, 2)}</pre>
      </section>

      <section>
        <h2 className="font-bold">Request log</h2>
        <pre className="bg-gray-100 p-2">{log.join("\n")}</pre>
      </section>
    </div>
  );
}
