import Link from "next/link";

/**
 * The 404 surface. `MASCOT.md` names this exact spot for the mascot's error pose ("build failures,
 * CI badges, 404 pages"), and until now nothing here used it — Next's default not-found body is a
 * bare, unstyled page in neither this product's tokens nor its language.
 *
 * A server component: nothing here reads session state or does anything interactive beyond a plain
 * link, so there is no reason to ship it to the client.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- a ~3 KB local SVG, same reasoning as
          `IntelConsole.tsx`. Real `alt` here: nothing else on this screen names the mascot's state. */}
      <img src="/mascot/analyst-error.svg" alt="The mascot, lost" width={128} height={72} />
      <div>
        <h1 className="font-display text-ink text-xl leading-none font-bold tracking-wide uppercase">
          Page not found
        </h1>
        <p className="text-ink-mid mt-2 max-w-xs text-sm leading-relaxed">
          That page doesn&rsquo;t exist, or it moved. Nothing here saves photographs or notes about
          it.
        </p>
      </div>
      <Link
        href="/map"
        className="bg-brand font-display focus-ring mt-2 flex h-11 items-center justify-center rounded-sm px-6 text-xs font-semibold tracking-[0.18em] text-white uppercase shadow-e1"
      >
        Back to the map
      </Link>
    </main>
  );
}
