import { connection } from "next/server";
import { collectInventory } from "@/lib/diagnostics/inventory";

export async function GET() {
  await connection();
  try {
    const inventory = await collectInventory();
    return Response.json(inventory);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inventory failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
