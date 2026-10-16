import { TESTS } from "@/lib/diagnostics/catalog";
import { runSuite } from "@/lib/diagnostics/tests";

export async function POST(request: Request) {
  let ids: string[] | undefined;
  try {
    const body = (await request.json()) as { ids?: unknown };
    if (body.ids != null) {
      if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== "string")) {
        return Response.json({ error: "ids must be an array of test ids" }, { status: 400 });
      }
      const known = new Set(TESTS.map((test) => test.id));
      ids = body.ids.filter((id) => known.has(id));
      if (ids.length === 0) {
        return Response.json({ error: "No known tests were requested" }, { status: 400 });
      }
    }
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  try {
    const report = await runSuite(ids);
    return Response.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suite failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
