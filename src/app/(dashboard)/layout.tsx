import { Sidebar } from "@/components/layout/Sidebar";
import { InboxCaptureModal } from "@/components/inbox/InboxCaptureModal";
import { KeyboardShortcutsProvider } from "@/components/shared/KeyboardShortcutsProvider";
import { ShortcutOverlay } from "@/components/shared/ShortcutOverlay";
import { GlobalSearch } from "@/components/shared/GlobalSearch";
import { AIToggleButton } from "@/components/ai/AIToggleButton";
import { MobileNavProvider } from "@/components/layout/MobileNavContext";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { MobileNavDrawer } from "@/components/layout/MobileNavDrawer";
import { UndoProvider } from "@/contexts/UndoContext";
import { UndoToast } from "@/components/undo/UndoToast";
import { TrialBanner } from "@/components/trial/TrialBanner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UndoProvider>
      <KeyboardShortcutsProvider>
        <MobileNavProvider>
          <div className="flex h-screen">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <TrialBanner />
              <MobileHeader />
              <main className="flex-1 overflow-y-auto pb-28 md:pb-0">
                <div className="py-4 md:py-6 px-4 md:px-8">
                  {children}
                </div>
              </main>
            </div>
          </div>
          <BottomTabBar />
          <MobileNavDrawer />
          <InboxCaptureModal />
          <GlobalSearch />
          <ShortcutOverlay />
          <AIToggleButton />
          <UndoToast />
        </MobileNavProvider>
      </KeyboardShortcutsProvider>
    </UndoProvider>
  );
}
