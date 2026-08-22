import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ChannelWizard } from "@/components/channels/channel-wizard";

export const dynamic = "force-dynamic";

export default function NewChannelPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="shrink-0 px-4 pt-[calc(12px+env(safe-area-inset-top))]">
        <div className="flex h-11 items-center gap-2">
          <Link href="/channels" className="text-muted-foreground -ml-1 flex size-9 items-center">
            <ArrowLeft className="size-[22px]" strokeWidth={1.9} />
          </Link>
          <h1 className="text-[17px] font-semibold">接入新渠道</h1>
        </div>
      </div>
      <ChannelWizard />
    </div>
  );
}
