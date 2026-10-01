"use client";

import Script from "next/script";

/*
 * Meta Pixel base code, gated on NEXT_PUBLIC_META_PIXEL_ID. Renders nothing
 * when the variable is unset. When set, loads Meta's fbevents.js snippet as
 * documented, with one `init` and one `PageView`, plus the noscript image
 * fallback. No other events are sent anywhere in the app.
 *
 * Snippet source: https://developers.facebook.com/docs/meta-pixel/get-started
 * (fetched 2026-10-01; the script block and the noscript img match the page,
 * with the pixel id substituted).
 *
 * Script props: node_modules/next/dist/client/script.d.ts line 3 (ScriptProps),
 * `strategy` line 4, `id` line 5, `children` line 9. Inline scripts need an id.
 */

/* NEXT_PUBLIC_ variables are inlined into the client bundle at build time, so
   the exact `process.env.NEXT_PUBLIC_META_PIXEL_ID` expression has to appear. */
const PIXEL_ID = (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "").trim();

/* Pixel ids are numeric. Anything else is treated as unset rather than
   interpolated into an inline script. */
const PIXEL_ID_PATTERN = /^\d{5,32}$/;

export function MetaPixel() {
  if (!PIXEL_ID_PATTERN.test(PIXEL_ID)) return null;

  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${PIXEL_ID}');
fbq('track', 'PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}

export default MetaPixel;
