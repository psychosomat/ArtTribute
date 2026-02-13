import { generateCommitPlan } from "../shared/generators";
import { executePlan } from "./executor";
import type { ExecutePlanRequest, GeneratePlanRequest } from "../shared/types";

const withCors = (response: Response) => {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  return new Response(response.body, { status: response.status, headers });
};

const json = (payload: unknown, status = 200) =>
  withCors(
    new Response(JSON.stringify(payload), {
      status,
      headers: {
        "Content-Type": "application/json"
      }
    })
  );

Bun.serve({
  port: 3001,
  async fetch(request: Request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json({ ok: true });
      }

      if (request.method === "POST" && url.pathname === "/api/plan") {
        const body = (await request.json()) as GeneratePlanRequest;
        return json(generateCommitPlan(body));
      }

      if (request.method === "POST" && url.pathname === "/api/execute") {
        const body = (await request.json()) as ExecutePlanRequest;
        const result = await executePlan(body);
        return json(result);
      }

      return json({ error: "Not Found" }, 404);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Unknown error" }, 400);
    }
  }
});

console.log("ArtTribute API ready on http://localhost:3001");
