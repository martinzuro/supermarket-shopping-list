import { ConnectionBanner } from "@/components/connection-banner";
import { AddItemBar } from "@/components/list/add-item-bar";
import { ListMasthead } from "@/components/list/list-masthead";
import { ListView } from "@/components/list/list-view";
import { HeaderActions } from "@/components/menu/header-actions";
import { Welcome } from "@/components/welcome/welcome";

export default function ListPage() {
  return (
    <>
      <header
        data-welcome-hide
        className="bg-paper pt-safe border-rule sticky top-0 z-10 border-b"
      >
        <div className="px-safe mx-auto flex h-14 w-full max-w-xl items-center justify-between">
          {/* The wordmark, or the shopping masthead (F-1). */}
          <ListMasthead actions={<HeaderActions />} />
        </div>
        <ConnectionBanner />
      </header>

      <main
        data-welcome-hide
        className="px-safe pb-add-bar mx-auto w-full max-w-xl flex-1 pt-2"
      >
        <ListView />
      </main>

      <div data-welcome-hide>
        <AddItemBar />
      </div>

      <Welcome />
    </>
  );
}
