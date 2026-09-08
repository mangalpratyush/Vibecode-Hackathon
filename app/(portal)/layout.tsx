import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import Sidebar from "@/components/portal/Sidebar";

/**
 * The portal shell: a fixed left rail and a scrolling content column.
 *
 * The Assistant used to float over this as a bubble. It is now a destination in
 * the rail like everything else — see components/portal/Sidebar.
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/");

  return (
    <div className="portal-canvas flex min-h-screen flex-col lg:flex-row">
      <Sidebar name={user.name} role={user.role === "ADVOCATE" ? "Advocate" : "Filing clerk"} />
      {/* min-w-0 so wide tables inside can scroll instead of stretching the grid. */}
      <main className="relative min-w-0 flex-1 overflow-hidden">
        <div className="relative z-10 mx-auto max-w-6xl px-5 py-8 sm:px-7 lg:px-9 lg:py-10 xl:px-11">
          {children}
        </div>
      </main>
    </div>
  );
}
