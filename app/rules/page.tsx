import { RuleComposer } from "@/components/rules/rule-composer";
import { RuleRow } from "@/components/rules/rule-row";
import { AppHeader } from "@/components/shell/app-header";
import { TabBar } from "@/components/shell/tab-bar";
import { currentChannel } from "@/lib/channel-scope";
import { channelCounts, listChannels, listRules } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const channel = await currentChannel();
  const [rules, channels, counts] = await Promise.all([
    listRules(),
    listChannels(),
    channelCounts(),
  ]);

  return (
    <>
      <AppHeader
        title="规则"
        sub={rules.length ? `${rules.length} 条 · 改完立刻重算全库` : "还没有规则"}
        channels={channels}
        counts={counts}
        current={channel}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-3 pb-4">
        <RuleComposer />

        {rules.length ? (
          <section className="flex flex-col gap-2.5">
            <h2 className="text-muted-foreground text-xs font-medium">你说过的 {rules.length} 条</h2>
            {rules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} channels={channels} />
            ))}
          </section>
        ) : (
          <p className="text-muted-foreground rounded-2xl border border-dashed px-6 py-12 text-center text-[13px] leading-relaxed">
            上面打一句话就行。
            <br />
            比如「只要 4K 的」「预告片别给我」。
          </p>
        )}
      </div>

      <TabBar />
    </>
  );
}
