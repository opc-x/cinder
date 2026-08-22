"use client";

import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";

import { isHLSProvider, MediaPlayer, MediaProvider, Poster } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import HLS from "hls.js";
import { useEffect, useState, useTransition } from "react";
import { markWatched } from "@/app/actions";

interface PlayerProps {
  id: string;
  title: string;
  poster?: string | null;
  streamType: "hls" | "mp4";
}

export function Player({ id, title, poster, streamType }: PlayerProps) {
  const [, startTransition] = useTransition();
  const proxySrc = `/api/stream/${encodeURIComponent(id)}`;
  const [src, setSrc] = useState(streamType === "hls" ? proxySrc : "");

  useEffect(() => {
    if (streamType === "hls") {
      setSrc(proxySrc);
      return;
    }
    let cancelled = false;
    fetch(`${proxySrc}?resolve=1`)
      .then((r) => r.json())
      .then((d: { url?: string }) => {
        if (!cancelled && d.url) setSrc(d.url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, streamType, proxySrc]);

  return (
    <MediaPlayer
      className="ring-ring/40 aspect-video w-full overflow-hidden rounded-xl focus-visible:ring-2"
      title={title}
      src={src ? { src, type: streamType === "hls" ? "application/x-mpegurl" : "video/mp4" } : undefined}
      load="eager"
      autoPlay
      muted
      playsInline
      onProviderChange={(provider) => {
        if (isHLSProvider(provider)) provider.library = HLS;
      }}
      onPlay={() => startTransition(() => markWatched(id))}
    >
      <MediaProvider>
        {poster ? <Poster className="vds-poster" src={poster} alt={title} /> : null}
      </MediaProvider>
      <DefaultVideoLayout icons={defaultLayoutIcons} />
    </MediaPlayer>
  );
}
