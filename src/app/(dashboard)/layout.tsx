import { Suspense } from "react";
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
import { OfflineIndicator } from "@/components/shared/OfflineIndicator";
import { ActiveChallengeBar } from "@/components/time-audit/ActiveChallengeBar";
import { TimerProvider } from "@/contexts/TimerContext";
import { TimerPill } from "@/components/timer/TimerPill";
import { RunawayTimerDialog } from "@/components/timer/RunawayTimerDialog";
import { CalendarSidebarProvider } from "@/contexts/CalendarSidebarContext";
import { CalendarSidebar } from "@/components/calendar/CalendarSidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UndoProvider>
      <KeyboardShortcutsProvider>
        <TimerProvider>
        <MobileNavProvider>
          <CalendarSidebarProvider>
            <div className="flex h-screen">
              <Sidebar />
              <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                <TrialBanner />
                <MobileHeader />
                <OfflineIndicator />
                <ActiveChallengeBar />
                <main className="flex-1 overflow-y-auto pb-28 md:pb-0">
                  <div
                    className="py-4 md:py-6 px-4 md:px-8"
                    style={{
                      paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
                      paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
                    }}
                  >
                    {children}
                  </div>
                </main>
              </div>
              <Suspense fallback={null}>
                <CalendarSidebar />
              </Suspense>
            </div>
            <BottomTabBar />
            <MobileNavDrawer />
            <InboxCaptureModal />
            <GlobalSearch />
            <ShortcutOverlay />
            <AIToggleButton />
            <UndoToast />
            <TimerPill />
            <RunawayTimerDialog />
          </CalendarSidebarProvider>
        </MobileNavProvider>
        </TimerProvider>
      </KeyboardShortcutsProvider>
    </UndoProvider>
  );
}
