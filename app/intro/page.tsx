import { redirect } from "next/navigation";

/**
 * `/intro` is retired. The long illustrated instructions it used to render are
 * replaced by the interactive guided run (`/new`) for new players and the
 * always-available "How to Play" (`?`) reference on every screen. Any old
 * bookmark just lands on the daily home.
 */
export default function IntroPage() {
  redirect("/");
}
