import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { storageMode } from "@/lib/store";
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
    <div className="flex min-h-screen flex-col bg-paper lg:flex-row">
      <Sidebar
        name={user.name}
        role={user.role === "ADVOCATE" ? "Advocate" : "Filing clerk"}
        storageMode={storageMode()}
      />
      {/* min-w-0 so wide tables inside can scroll instead of stretching the grid. */}
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl px-6 py-9 lg:px-10 lg:py-12">{children}</div>
      </main>
    </div>
  );
}
