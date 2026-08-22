import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";
import { ChannelRow } from "@/components/channels/channel-row";
import { channelCounts, listChannels } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const [channels, counts] = await Promise.all([listChannels(), channelCounts()]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="shrink-0 px-4 pt-[calc(12px+env(safe-area-inset-top))]">
        <div className="flex h-11 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-muted-foreground -ml-1 flex size-9 items-center">
              <ArrowLeft className="size-[22px]" strokeWidth={1.9} />
            </Link>
            <h1 className="text-[19px] font-semibold tracking-tight">渠道</h1>
          </div>
          <Link
            href="/channels/new"
            aria-label="接入新渠道"
            className="text-muted-foreground flex size-11 items-center justify-end"
          >
            <Plus className="size-[22px]" strokeWidth={1.9} />
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-3 pb-[calc(24px+env(safe-area-inset-bottom))]">
        <p className="text-muted-foreground text-xs leading-relaxed">
          规则是全库共用的，切渠道只换数据源。
          <br />
          要让某条规则只管一个渠道，去规则的确认页里单独标。
        </p>

        {channels.map((c) => (
          <ChannelRow key={c.id} channel={c} count={counts[c.id] ?? 0} />
        ))}

        <Link
          href="/channels/new"
          className="text-muted-foreground flex flex-col items-center gap-2.5 rounded-2xl border border-dashed px-6 py-7 text-center"
        >
          <Plus className="size-6" strokeWidth={1.6} />
          <span className="text-[13px] leading-relaxed">
            接入只要一个首页地址
            <br />
            探测完你点几下确认字段就行
          </span>
        </Link>
      </div>
    </div>
  );
}
