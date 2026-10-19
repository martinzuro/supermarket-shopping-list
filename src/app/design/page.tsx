import type { Metadata } from "next";
import {
  ArrowDownToLine,
  Check,
  CircleAlert,
  Menu,
  Plus,
  Users,
  WifiOff,
} from "lucide-react";
import { CategoryIcon } from "@/components/icons/category-icons";
import {
  CartIllustration,
  EmptyBagIllustration,
  FullBagIllustration,
  InvitationIllustration,
} from "@/components/illustrations";
import { InvitationCard } from "@/components/ui/invitation-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Moment } from "@/components/ui/moment";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { CategoryChip, Chip } from "@/components/ui/chip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListRow } from "@/components/ui/list-row";
import { Section as UiSection, SectionEmpty } from "@/components/ui/section";
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
import { ChipPickerDemo, RowsDemo, SheetDemo } from "./states-demo";

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
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-5">
          {categoryIds.map((id) => (
            <li key={id} className="flex flex-col items-start gap-3">
              <CategoryIcon category={id} className="size-12" />
              <div className="flex items-center gap-2">
                <CategoryIcon category={id} className="size-5" />
                <CategoryIcon category={id} className="size-3.5" />
              </div>
              <p className="eyebrow">{t.categories.names[id]}</p>
            </li>
          ))}
        </ul>
        <Meta>{t.categories.icons}</Meta>
        <ul className="mt-10 flex flex-wrap gap-2">
          {categoryIds.map((id) => (
            <li key={id}>
              <CategoryChip category={id}>
                {t.categories.names[id]}
              </CategoryChip>
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

      {/* Ilustración */}
      <Section
        id="ilustracion"
        eyebrow={t.sections.illustration.eyebrow}
        title={t.sections.illustration.title}
      >
        <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <li>
            <EmptyBagIllustration className="text-ink size-32" />
            <Meta>{t.illustration.emptyBag}</Meta>
          </li>
          <li>
            <CartIllustration className="text-ink size-32" />
            <Meta>{t.illustration.cart}</Meta>
          </li>
          <li>
            <FullBagIllustration className="text-ink size-32" />
            <Meta>{t.illustration.fullBag}</Meta>
          </li>
          <li>
            <InvitationIllustration className="text-ink size-32" />
            <Meta>{t.illustration.invitation}</Meta>
          </li>
        </ul>
        <p className="text-ink-2 mt-8 max-w-prose text-pretty">
          {t.illustration.note}
        </p>
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
            <div className="surface-inverse rounded-sheet h-28" aria-hidden />
            <Meta>{t.surfaces.inverse}</Meta>
          </div>
        </div>

        <div className="mt-10">
          <Moment
            eyebrow={texts.moments.cartEmptied.eyebrow}
            lead={texts.moments.cartEmptied.lead}
            em={texts.moments.cartEmptied.em}
            body={texts.moments.cartEmptied.body}
            illustration={<FullBagIllustration />}
            action={
              <Button
                type="button"
                className="bg-lime text-on-lime hover:bg-lime/90 dark:hover:bg-lime/90"
              >
                {texts.moments.cartEmptied.action}
              </Button>
            }
          />
        </div>
        <Meta>{t.surfaces.moment}</Meta>

        <div className="bg-paper rounded-sheet shadow-sheet mt-10 max-w-sm p-6">
          <p className="text-heading">{t.surfaces.sheetTitle}</p>
          <p className="text-ink-2 mt-2">{t.surfaces.sheetBody}</p>
          <span className="bg-action-bg text-action-fg text-label h-touch mt-6 inline-flex items-center rounded-full px-5">
            {t.states.buttonVariants.secondary}
          </span>
        </div>
        <Meta>{t.surfaces.sheet}</Meta>

        <div className="mt-10 grid max-w-2xl gap-6 sm:grid-cols-2">
          {[t.surfaces.invitationLink, null].map((link) => (
            <InvitationCard
              key={link ?? "pending"}
              eyebrow={texts.share.card.eyebrow}
              title={t.surfaces.invitationList}
              linkLabel={texts.share.card.linkLabel}
              link={link}
              pending={texts.share.card.preparing}
              note={texts.share.card.note}
            />
          ))}
        </div>
        <Meta>{t.surfaces.invitation}</Meta>
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
          <Button type="button">{t.states.buttonVariants.default}</Button>
          <Button type="button" variant="secondary">
            {t.states.buttonVariants.secondary}
          </Button>
          <Button type="button" variant="outline">
            {t.states.buttonVariants.outline}
          </Button>
          <Button type="button" variant="ghost">
            {t.states.buttonVariants.ghost}
          </Button>
          <Button type="button" variant="danger">
            {t.states.buttonVariants.danger}
          </Button>
          <Button type="button" variant="link">
            {t.states.buttonVariants.link}
          </Button>
          <Button type="button" disabled>
            {t.states.buttonVariants.disabled}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            aria-label={t.states.buttonVariants.icon}
          >
            <Plus aria-hidden strokeWidth={1.5} />
          </Button>
          <Button
            type="button"
            size="icon-touch-lg"
            aria-label={t.states.buttonVariants.iconLarge}
          >
            <Plus aria-hidden strokeWidth={2.5} />
          </Button>
        </div>

        <p className="eyebrow mt-8">{t.states.sizes}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="sm">
            {t.states.sizeLabels.sm}
          </Button>
          <Button type="button" variant="secondary" size="touch">
            {t.states.sizeLabels.touch}
          </Button>
          <Button type="button" variant="secondary" size="touch-lg">
            {t.states.sizeLabels.touchLg}
          </Button>
        </div>

        <p className="eyebrow mt-10">{t.states.fields}</p>
        <div className="mt-3 grid max-w-md gap-6">
          <Field label={t.states.field.label} help={t.states.field.help}>
            <Input type="text" placeholder={t.states.field.placeholder} />
          </Field>
          <Field
            label={t.states.field.invalidLabel}
            error={t.states.field.invalidHelp}
          >
            <Input type="email" defaultValue={t.states.field.invalidValue} />
          </Field>
          <Field label={t.states.field.disabledLabel}>
            <Input
              type="text"
              disabled
              defaultValue={t.states.field.disabledValue}
            />
          </Field>
        </div>

        <p className="eyebrow mt-10">{t.states.chips}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {categoryIds.map((id) => (
            <CategoryChip key={id} category={id}>
              {t.categories.names[id]}
            </CategoryChip>
          ))}
          <Chip>{t.states.eyebrowSamples[2]}</Chip>
        </div>
        <p className="eyebrow mt-6">{t.states.chipsInteractive}</p>
        <div className="mt-3">
          <ChipPickerDemo />
        </div>

        <p className="eyebrow mt-10">{t.states.eyebrows}</p>
        <div className="mt-3 grid gap-2">
          <Eyebrow>{t.states.eyebrowSamples[0]}</Eyebrow>
          <Eyebrow tone="ink">{t.states.eyebrowSamples[1]}</Eyebrow>
        </div>

        <p className="eyebrow mt-10">{t.states.empty}</p>
        <div className="mt-3 grid gap-4">
          <EmptyState
            illustration={<EmptyBagIllustration />}
            body={texts.list.pending.empty}
          />
          <div className="bg-paper-2 rounded-sheet px-4">
            <EmptyState
              illustration={<CartIllustration />}
              body={texts.list.cart.empty}
            />
          </div>
        </div>

        <p className="eyebrow mt-10">{t.states.rows}</p>
        <div className="mt-3">
          <RowsDemo />
        </div>

        <p className="eyebrow mt-10">{t.states.sections}</p>
        <div className="mt-3 grid gap-6">
          <UiSection
            id="design-section"
            title={t.states.section.title}
            count={t.states.section.count}
            eyebrow={t.states.section.eyebrow}
            thread="verduras"
            icon={<CategoryIcon category="verduras" />}
          >
            <ul className="border-rule border-t">
              {t.states.rowItems.map((item) => (
                <ListRow
                  key={item.name}
                  name={item.name}
                  quantity={item.quantity || undefined}
                  checked={item.checked}
                />
              ))}
            </ul>
          </UiSection>
          <UiSection
            id="design-section-empty"
            title={t.states.section.emptyTitle}
            thread="congelados"
            icon={<CategoryIcon category="congelados" />}
          >
            <SectionEmpty>{t.states.section.empty}</SectionEmpty>
          </UiSection>
          <div>
            <p className="eyebrow mb-1">{t.states.section.groupNote}</p>
            <UiSection
              id="design-section-group"
              level={3}
              title={t.states.section.groupTitle}
              count={t.states.section.groupCount}
              thread="lacteos"
              icon={<CategoryIcon category="lacteos" />}
            >
              <ul className="border-rule border-t">
                <ListRow name={t.states.section.groupItem} checked={false} />
              </ul>
            </UiSection>
          </div>
        </div>

        <p className="eyebrow mt-10">{t.states.sheets}</p>
        <div className="mt-3">
          <SheetDemo />
        </div>

        <p className="eyebrow mt-10">{t.states.banners}</p>
        <div className="mt-3 grid gap-3">
          <Banner
            tone="info"
            icon={WifiOff}
            title={t.states.banner.info.title}
            body={t.states.banner.info.body}
            action={
              <Button type="button" variant="outline" size="sm">
                {t.states.banner.info.action}
              </Button>
            }
          />
          <Banner
            tone="attention"
            icon={Users}
            title={t.states.banner.attention.title}
            body={t.states.banner.attention.body}
          />
          <Banner
            tone="error"
            icon={CircleAlert}
            title={t.states.banner.error.title}
            body={t.states.banner.error.body}
            action={
              <Button type="button" variant="outline" size="sm">
                {t.states.banner.error.action}
              </Button>
            }
          />
          <Banner
            tone="info"
            icon={ArrowDownToLine}
            title={t.states.banner.footer.title}
            body={t.states.banner.footer.body}
            footer={
              <>
                <Button type="button">{t.states.banner.footer.primary}</Button>
                <Button type="button" variant="outline">
                  {t.states.banner.footer.secondary}
                </Button>
              </>
            }
          />
        </div>
      </Section>
    </main>
  );
}
