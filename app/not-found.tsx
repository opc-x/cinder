import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold">没找到这个页面</h1>
      <p className="text-muted-foreground text-sm">链接失效，或者这条媒体已经从库里被规则剔掉了。</p>
      <Link href="/">
        <Button variant="outline">返回库</Button>
      </Link>
    </div>
  );
}
