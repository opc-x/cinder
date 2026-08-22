import { Flame } from "lucide-react";
import { ChannelSwitcher } from "./channel-switcher";
import { IngestButton } from "@/components/ingest-button";
import type { Channel } from "@/lib/db/schema";

interface Props {
  title?: string;
  sub?: string;
  channels: Channel[];
  counts: Record<string, number>;
  current?: string;
  showIngest?: boolean;
}

/** 顶栏：左边身份，右边渠道作用域。pt 留给刘海。 */
export function AppHeader({ title, sub, channels, counts, current, showIngest }: Props) {
  return (
    <header className="shrink-0 px-4 pt-[calc(12px+env(safe-area-inset-top))]">
      <div className="flex h-11 items-center justify-between gap-3">
        {title ? (
          <h1 className="text-[19px] font-semibold tracking-tight">{title}</h1>
        ) : (
          <span className="flex items-center gap-2">
            <Flame className="text-primary size-[22px]" strokeWidth={1.9} />
            <span className="text-[19px] font-semibold tracking-tight">Cinder</span>
          </span>
        )}
        <div className="flex items-center gap-2">
          {showIngest ? <IngestButton channelId={current} /> : null}
          <ChannelSwitcher channels={channels} counts={counts} current={current} />
        </div>
      </div>
      {sub ? <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p> : null}
    </header>
  );
}
