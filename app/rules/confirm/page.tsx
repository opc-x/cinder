import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { RuleConfirm } from "@/components/rules/rule-confirm";
import { Skeleton } from "@/components/ui/skeleton";
import { inferRuleAction } from "@/app/actions";
import { currentChannel } from "@/lib/channel-scope";
import { listChannels } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ConfirmPage({ searchParams }: PageProps<"/rules/confirm">) {
  const sp = await searchParams;
  const said = (Array.isArray(sp.said) ? sp.said[0] : sp.said)?.trim();
  if (!said) redirect("/rules");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="shrink-0 px-4 pt-[calc(12px+env(safe-area-inset-top))]">
        <div className="flex h-11 items-center gap-2">
          <Link href="/rules" className="text-muted-foreground -ml-1 flex size-9 items-center">
            <ArrowLeft className="size-[22px]" strokeWidth={1.9} />
          </Link>
          <h1 className="text-[17px] font-semibold">确认规则</h1>
        </div>
      </div>

      <Suspense fallback={<Thinking said={said} />}>
        <Inferred said={said} />
      </Suspense>
    </div>
  );
}

async function Inferred({ said }: { said: string }) {
  const channel = await currentChannel();
  const channels = await listChannels();
  const { inferred, preview } = await inferRuleAction(said, channel);
  return (
    <RuleConfirm
      said={said}
      inferred={inferred}
      preview={preview}
      channels={channels}
      defaultChannel={channel ?? null}
    />
  );
}

function Thinking({ said }: { said: string }) {
  return (
    <div className="flex flex-col gap-4 px-4 pt-2.5">
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs">你说的</span>
        <div className="bg-card border-border rounded-2xl border p-3.5 text-[15px] leading-relaxed">
          {said}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs">本地模型正在翻译…</span>
        <Skeleton className="h-24 rounded-2xl" />
      </div>
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}
