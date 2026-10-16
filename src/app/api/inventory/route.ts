import { collectInventory } from "@/lib/diagnostics/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const inventory = await collectInventory();
    return Response.json(inventory);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inventory failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
