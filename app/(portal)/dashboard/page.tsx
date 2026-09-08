import { redirect } from "next/navigation";

/**
 * Signing in always lands on a new filing.
 *
 * This used to show the list of past filings, and only fall through to the
 * upload screen when the list happened to be empty. That meant an advocate who
 * had used PARAM once was met by yesterday's bundles with no obvious way to
 * start, which is backwards: the reason to open this tool is a filing you are
 * about to make, not one you already made.
 *
 * Past filings have not gone anywhere. They live at /filings, reachable from
 * the sidebar at any time.
 */
export default function DashboardRoute() {
  redirect("/new");
}
