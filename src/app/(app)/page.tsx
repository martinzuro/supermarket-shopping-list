import { ConnectionBanner } from "@/components/connection-banner";
import { AddItemBar } from "@/components/list/add-item-bar";
import { ListView } from "@/components/list/list-view";
import { AppMenu } from "@/components/menu/app-menu";
import { texts } from "@/lib/texts";

export default function ListPage() {
  return (
    <>
      <header className="bg-background/95 pt-safe sticky top-0 z-10 border-b backdrop-blur-md">
        <div className="px-safe mx-auto flex h-14 w-full max-w-xl items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">
            {texts.app.name}
          </h1>
          <AppMenu />
        </div>
        <ConnectionBanner />
      </header>

      <main className="px-safe pb-add-bar mx-auto w-full max-w-xl flex-1 pt-1">
        <ListView />
      </main>

      <AddItemBar />
    </>
  );
}
