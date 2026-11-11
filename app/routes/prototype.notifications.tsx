// PROTOTYPE (issue #30): /notifications page for variant B, plus the "send samples"
// action that triggers one of each of the 7 catalogue Notifications to the current
// user through the real Knock workflow. Never merge to main.

import { data } from "react-router";
import { Knock } from "@knocklabs/node";
import { eq, ne } from "drizzle-orm";
import type { Route } from "./+types/prototype.notifications";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import { users, courses, modules, lessons } from "~/db/schema";
import { FeedPage } from "~/components/prototype-notification-feed";

// Reuses the committed spike workflow; Cadence renders rows from `data.kind`.
const WORKFLOW = "discussion-reply";

export async function action({ request }: Route.ActionArgs) {
  const me = await getCurrentUserId(request);
  if (!me) throw data("Select a user from the DevUI panel.", { status: 401 });
  const recipient = db.select().from(users).where(eq(users.id, me)).get()!;
  const others = db.select().from(users).where(ne(users.id, me)).limit(4).all();
  const course = db.select().from(courses).limit(1).get()!;
  const mod = db.select().from(modules).where(eq(modules.courseId, course.id)).limit(1).get();
  const lesson = mod ? db.select().from(lessons).where(eq(lessons.moduleId, mod.id)).limit(1).get() : undefined;
  const lessonLink = lesson ? `/courses/${course.slug}/lessons/${lesson.id}` : `/courses/${course.slug}`;
  const who = (i: number) => others[i % others.length];

  const samples = [
    { kind: "enrollment", actor: who(0), courseTitle: course.title, link: `/instructor/${course.id}/students` },
    { kind: "seat_claimed", actor: who(1), courseTitle: course.title, seatsLeft: 3, link: "/team" },
    { kind: "refund_requested", actor: who(2), courseTitle: course.title, amount: "$79.00",
      reason: "The course went deeper into generics than I need for my job right now.", link: "/admin/refunds" },
    { kind: "refund_declined", actor: null, courseTitle: course.title,
      note: "You've completed over half the course, which is past our refund window.", link: `/courses/${course.slug}` },
    { kind: "refund_approved", actor: null, courseTitle: course.title, amount: "$79.00",
      note: "Sorry it wasn't a fit. Hope to see you back.", link: "/courses" },
    { kind: "discussion_question", actor: who(3), courseTitle: course.title, lessonTitle: lesson?.title ?? "Lesson 1",
      snippet: "Why does the loader run again when I only change a search param? I expected it to be cached.", link: lessonLink },
    { kind: "discussion_reply", actor: who(0), courseTitle: course.title, lessonTitle: lesson?.title ?? "Lesson 1",
      snippet: "Good question! Loaders revalidate on any navigation by default; use shouldRevalidate to opt out.", link: lessonLink },
  ];

  const knock = new Knock({ apiKey: process.env.KNOCK_API_KEY });
  for (const s of samples) {
    const { actor, ...rest } = s;
    await knock.workflows.trigger(WORKFLOW, {
      recipients: [{ id: String(recipient.id), name: recipient.name, email: recipient.email }],
      actor: actor ? { id: String(actor.id), name: actor.name, email: actor.email } : undefined,
      data: { ...rest, actorName: actor?.name ?? "Cadence" },
    });
    await new Promise((r) => setTimeout(r, 300)); // keep insertion order stable
  }
  return { sent: samples.length };
}

export default function NotificationsPrototypePage() {
  return <FeedPage />;
}
