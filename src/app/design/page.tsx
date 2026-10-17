import type { Metadata } from "next";
import { Check, Menu, WifiOff } from "lucide-react";
import { contrastRatio, formatRatio } from "@/lib/design/contrast";
import {
  categoryIds,
  contrastPairs,
  palette,
  type Mode,
  type PaletteToken,
} from "@/lib/design/tokens";
import { texts } from "@/lib/texts";
import { MotionDemo } from "./motion-demo";

const t = texts.design;

export const metadata: Metadata = {
  title: t.title,
  robots: { index: false, follow: false },
};

const swatches: PaletteToken[] = [
  "paper",
  "paper-2",
  "ink",
  "ink-2",
  "ink-3",
  "forest",
  "lime",
  "citrus",
  "citrus-text",
  "tomato",
  "tomato-text",
  "inverse-bg",
];

const modes: Mode[] = ["light", "dark"];

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="border-rule grid gap-6 border-b py-10 md:grid-cols-[12rem_1fr] md:gap-10 md:py-14"
    >
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={`${id}-title`} className="text-heading mt-2">
          {title}
        </h2>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow mt-2">{children}</p>;
}

export default function DesignPage() {
  return (
    <main className="px-safe mx-auto w-full max-w-4xl pt-10 pb-24 md:pt-16">
      <header className="border-rule border-b pb-10 md:pb-14">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1 className="text-display mt-4 font-serif text-balance">
          {t.heading.lead} <em>{t.heading.em}</em>
        </h1>
        <p className="text-ink-2 mt-6 max-w-prose text-pretty">{t.intro}</p>
      </header>

      {/* Marca */}
      <Section
        id="marca"
        eyebrow={t.sections.brand.eyebrow}
        title={t.sections.brand.title}
      >
        <p className="text-display font-serif">{texts.app.name}</p>
        <Meta>{t.brand.note}</Meta>
        <div className="border-rule mt-8 border-y">
          <div className="flex h-14 items-center justify-between">
            <span className="text-title font-serif">{texts.app.name}</span>
            <span
              aria-hidden
              className="text-ink size-touch flex items-center justify-center rounded-full"
            >
              <Menu className="size-5" strokeWidth={1.5} />
            </span>
          </div>
        </div>
        <Meta>{t.brand.headerSample}</Meta>
      </Section>

      {/* Tipografía */}
      <Section
        id="tipografia"
        eyebrow={t.sections.type.eyebrow}
        title={t.sections.type.title}
      >
        <div className="grid gap-8">
          <div>
            <p className="text-display font-serif text-balance">
              {t.type.display.sample} <em>{t.type.display.em}</em>
            </p>
            <Meta>{t.type.display.meta}</Meta>
          </div>
          <div>
            <p className="text-title font-serif">{t.type.title.sample}</p>
            <Meta>{t.type.title.meta}</Meta>
          </div>
          <div>
            <p className="text-heading">{t.type.heading.sample}</p>
            <Meta>{t.type.heading.meta}</Meta>
          </div>
          <div>
            <p className="text-row flex items-baseline gap-3">
              <span>{t.type.row.sample}</span>
              <span className="text-ink-2 text-label font-mono" data-numeric>
                {t.type.row.qty}
              </span>
            </p>
            <Meta>{t.type.row.meta}</Meta>
          </div>
          <div>
            <p className="max-w-prose text-pretty">{t.type.body.sample}</p>
            <Meta>{t.type.body.meta}</Meta>
          </div>
          <div>
            <p className="text-label">{t.type.label.sample}</p>
            <Meta>{t.type.label.meta}</Meta>
          </div>
          <div>
            <p className="eyebrow">{t.type.eyebrow.sample}</p>
            <Meta>{t.type.eyebrow.meta}</Meta>
          </div>
          <div>
            <p className="text-heading font-mono" data-numeric>
              {t.type.data.sample}
            </p>
            <Meta>{t.type.data.meta}</Meta>
          </div>
        </div>
      </Section>

      {/* Color */}
      <Section
        id="color"
        eyebrow={t.sections.color.eyebrow}
        title={t.sections.color.title}
      >
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4">
          {swatches.map((name) => (
            <li key={name}>
              <div
                aria-hidden
                className="border-rule rounded-field h-20 border"
                style={{ background: `var(--${name})` }}
              />
              <p className="text-label mt-2">{name}</p>
              <p className="text-ink-2 text-eyebrow mt-1 font-mono">
                {palette.light[name]}
              </p>
              <p className="text-ink-2 text-eyebrow font-mono">
                {palette.dark[name]}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap gap-3">
          <span className="bg-action-bg text-action-fg text-label h-touch flex items-center rounded-full px-5">
            {t.color.actionSample}
          </span>
          <span className="bg-lime text-label h-touch text-on-lime flex items-center gap-2 rounded-full px-5">
            <Check className="size-4" strokeWidth={2.5} aria-hidden />
            {t.color.doneSample}
          </span>
        </div>

        <h3 className="text-heading mt-12">{t.color.pairs}</h3>
        <div className="mt-4 grid gap-10 md:grid-cols-2">
          {modes.map((mode) => (
            <div key={mode}>
              <p className="eyebrow">{t.color[mode]}</p>
              <table className="border-rule text-label mt-3 w-full border-t">
                <thead className="sr-only">
                  <tr>
                    <th>{t.color.pair}</th>
                    <th>{t.color.ratio}</th>
                    <th>{t.color.minimum}</th>
                  </tr>
                </thead>
                <tbody>
                  {contrastPairs(mode).map((pair) => {
                    const ratio = contrastRatio(pair.fg, pair.bg);
                    const ok = ratio >= pair.min;
                    return (
                      <tr key={pair.name} className="border-rule border-b">
                        <td className="py-2 pr-3">{pair.name}</td>
                        <td className="py-2 pr-3 font-mono" data-numeric>
                          {formatRatio(ratio)}
                        </td>
                        <td
                          className={[
                            "py-2 text-right font-mono",
                            ok ? "text-ink-2" : "text-tomato-text",
                          ].join(" ")}
                        >
                          <span className="sr-only">
                            {ok ? t.color.pass : t.color.fail}{" "}
                          </span>
                          {pair.min}:1
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </Section>

      {/* Categorías */}
      <Section
        id="categorias"
        eyebrow={t.sections.categories.eyebrow}
        title={t.sections.categories.title}
      >
        <ul className="flex flex-wrap gap-2">
          {categoryIds.map((id) => (
            <li
              key={id}
              className="text-ink text-label rounded-field inline-flex h-7 items-center px-2.5"
              style={{ background: `var(--cat-${id})` }}
            >
              {t.categories.names[id]}
            </li>
          ))}
        </ul>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {categoryIds.slice(0, 4).map((id) => (
            <div
              key={id}
              className="border-l-2 pl-4"
              style={{ borderColor: `var(--cat-${id}-thread)` }}
            >
              <p className="eyebrow">{t.categories.names[id]}</p>
              <p className="text-row mt-2">{t.type.row.sample}</p>
            </div>
          ))}
        </div>
        <Meta>{t.categories.thread}</Meta>
      </Section>

      {/* Espaciado y radios */}
      <Section
        id="espaciado"
        eyebrow={t.sections.spacing.eyebrow}
        title={t.sections.spacing.title}
      >
        <div className="grid gap-6">
          <div>
            <div className="bg-paper-2 w-margin h-3 rounded-none" aria-hidden />
            <Meta>{t.spacing.margin}</Meta>
          </div>
          <div>
            <div className="bg-paper-2 w-gap h-3 rounded-none" aria-hidden />
            <Meta>{t.spacing.gap}</Meta>
          </div>
          <div>
            <div className="flex items-end gap-2" aria-hidden>
              {[1, 2, 3, 4, 6, 8, 12, 16].map((step) => (
                <div
                  key={step}
                  className="bg-ink-3 w-3"
                  style={{ height: `${step * 4}px` }}
                />
              ))}
            </div>
            <Meta>{t.spacing.steps}</Meta>
          </div>
        </div>
        <ul className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {(
            [
              ["rounded-none", t.spacing.radii.none],
              ["rounded-field", t.spacing.radii.field],
              ["rounded-sheet", t.spacing.radii.sheet],
              ["rounded-full", t.spacing.radii.pill],
            ] as const
          ).map(([cls, label]) => (
            <li key={cls}>
              <div
                aria-hidden
                className={`border-field-border h-16 w-full border ${cls}`}
              />
              <Meta>{label}</Meta>
            </li>
          ))}
        </ul>
      </Section>

      {/* Superficies */}
      <Section
        id="superficies"
        eyebrow={t.sections.surfaces.eyebrow}
        title={t.sections.surfaces.title}
      >
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <div className="border-rule bg-paper h-28 border" aria-hidden />
            <Meta>{t.surfaces.paper}</Meta>
          </div>
          <div>
            <div className="bg-paper-2 rounded-sheet h-28" aria-hidden />
            <Meta>{t.surfaces.paper2}</Meta>
          </div>
          <div>
            <div className="bg-inverse-bg rounded-sheet h-28" aria-hidden />
            <Meta>{t.surfaces.inverse}</Meta>
          </div>
        </div>

        <div className="bg-inverse-bg text-inverse-fg rounded-sheet mt-10 px-6 py-10 md:px-10 md:py-14">
          <p className="text-display font-serif text-balance">
            {t.surfaces.inverseSample.lead}{" "}
            <em>{t.surfaces.inverseSample.em}</em>
          </p>
          <p className="text-inverse-fg-2 mt-4 max-w-prose">
            {t.surfaces.inverseSample.body}
          </p>
        </div>

        <div className="bg-paper rounded-sheet shadow-sheet mt-10 max-w-sm p-6">
          <p className="text-heading">{t.surfaces.sheetTitle}</p>
          <p className="text-ink-2 mt-2">{t.surfaces.sheetBody}</p>
          <span className="bg-action-bg text-action-fg text-label h-touch mt-6 inline-flex items-center rounded-full px-5">
            {t.states.secondary}
          </span>
        </div>
        <Meta>{t.surfaces.sheet}</Meta>
      </Section>

      {/* Motion */}
      <Section
        id="motion"
        eyebrow={t.sections.motion.eyebrow}
        title={t.sections.motion.title}
      >
        <ul className="border-rule text-label border-t">
          {t.motion.tokens.map((row) => (
            <li
              key={row.token}
              className="border-rule grid gap-x-6 gap-y-1 border-b py-3 sm:grid-cols-[13rem_1fr] md:grid-cols-[13rem_14rem_1fr]"
            >
              <span className="font-mono">{row.token}</span>
              <span className="text-ink-2 font-mono">{row.value}</span>
              <span className="text-ink-2 sm:col-span-2 md:col-span-1">
                {row.use}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-10">
          <MotionDemo />
        </div>
      </Section>

      {/* Estados */}
      <Section
        id="estados"
        eyebrow={t.sections.states.eyebrow}
        title={t.sections.states.title}
      >
        <p className="eyebrow">{t.states.buttons}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="bg-action-bg text-action-fg text-label hover:bg-forest dark:hover:bg-lime/85 duration-instant h-touch inline-flex items-center rounded-full px-5 transition-[background-color,transform] ease-out active:scale-[0.98]"
          >
            {t.states.primary}
          </button>
          <button
            type="button"
            className="bg-paper-2 text-ink text-label hover:bg-paper-pressed duration-instant h-touch inline-flex items-center rounded-full px-5 transition-[background-color,transform] ease-out active:scale-[0.98]"
          >
            {t.states.secondary}
          </button>
          <button
            type="button"
            className="text-ink text-label hover:bg-paper-hover duration-instant h-touch inline-flex items-center rounded-full px-4 transition-[background-color,transform] ease-out active:scale-[0.98]"
          >
            {t.states.ghost}
          </button>
          <button
            type="button"
            disabled
            className="bg-paper-hover text-ink-3 text-label h-touch inline-flex cursor-not-allowed items-center rounded-full px-5"
          >
            {t.states.disabled}
          </button>
          <button
            type="button"
            className="text-tomato-text text-label hover:bg-paper-hover duration-instant h-touch inline-flex items-center rounded-full px-4 transition-[background-color,transform] ease-out active:scale-[0.98]"
          >
            {t.states.danger}
          </button>
        </div>

        <p className="eyebrow mt-10">{t.states.fields}</p>
        <div className="mt-3 grid max-w-md gap-6">
          <div>
            <label htmlFor="design-field" className="text-label block">
              {t.states.fieldLabel}
            </label>
            <input
              id="design-field"
              type="text"
              placeholder={t.states.fieldPlaceholder}
              className="border-field-border bg-paper text-ink placeholder:text-ink-2 duration-fast h-touch rounded-field mt-2 w-full border px-3 text-base transition-colors ease-out"
            />
          </div>
          <div>
            <label htmlFor="design-field-invalid" className="text-label block">
              {t.states.fieldInvalidLabel}
            </label>
            <input
              id="design-field-invalid"
              type="email"
              defaultValue={t.states.fieldInvalidValue}
              aria-invalid
              aria-describedby="design-field-invalid-help"
              className="border-tomato-text bg-paper text-ink h-touch rounded-field mt-2 w-full border px-3 text-base"
            />
            <p
              id="design-field-invalid-help"
              className="text-tomato-text text-label mt-2"
            >
              {t.states.fieldInvalidHelp}
            </p>
          </div>
        </div>

        <p className="eyebrow mt-10">{t.states.rows}</p>
        <ul className="border-rule mt-3 border-t">
          {t.states.rowItems.map((row) => (
            <li
              key={row.name}
              className="border-rule text-row h-row flex items-center gap-4 border-b"
            >
              <span
                aria-hidden
                className={[
                  "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                  row.checked ? "bg-lime border-lime" : "border-field-border",
                ].join(" ")}
              >
                {row.checked ? (
                  <Check className="text-on-lime size-4" strokeWidth={2.5} />
                ) : null}
              </span>
              <span className={row.checked ? "text-ink-2 line-through" : ""}>
                {row.name}
              </span>
              {row.qty ? (
                <span
                  className="text-ink-2 text-label ml-auto font-mono"
                  data-numeric
                >
                  {row.qty}
                </span>
              ) : null}
            </li>
          ))}
        </ul>

        <p className="eyebrow mt-10">{t.states.banner}</p>
        <div
          role="status"
          className="bg-paper-2 rounded-sheet mt-3 flex items-center gap-3 px-4 py-3"
        >
          <WifiOff
            aria-hidden
            className="text-ink-2 size-5 shrink-0"
            strokeWidth={1.5}
          />
          <p className="text-label min-w-0 flex-1">
            <span className="block font-medium">{t.states.bannerTitle}</span>
            <span className="text-ink-2 block font-normal">
              {t.states.bannerBody}
            </span>
          </p>
          <button
            type="button"
            className="text-ink text-label hover:bg-paper-pressed duration-instant h-touch shrink-0 rounded-full px-3 transition-colors ease-out"
          >
            {t.states.bannerAction}
          </button>
        </div>
      </Section>
    </main>
  );
}
