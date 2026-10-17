import { v7 } from "uuid";

// Ids are generated on the client (plan 3.2, ADR 0003) as UUID v7.
export function newId(): string {
  return v7();
}
