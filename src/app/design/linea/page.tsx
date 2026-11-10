import type { Metadata } from "next";
import { texts } from "@/lib/texts";
import { LinePrototype } from "./line-prototype";

export const metadata: Metadata = {
  title: texts.design.line.title,
  robots: { index: false, follow: false },
};

/** Prototype: shopping mode as a metro line, with sample data. */
export default function LinePage() {
  return <LinePrototype />;
}
