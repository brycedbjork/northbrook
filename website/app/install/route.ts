export const runtime = "edge";

const BOOTSTRAP_URL =
  "https://raw.githubusercontent.com/north-brook/broker-cli/main/install/bootstrap.sh";

export async function GET() {
  const res = await fetch(BOOTSTRAP_URL, { next: { revalidate: 300 } });
  if (!res.ok) {
    return new Response("Failed to fetch installer", { status: 502 });
  }
  const script = await res.text();
  return new Response(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
