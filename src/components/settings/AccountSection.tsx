"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HardDrive, Database, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { ICON_LED_ROW_CLASS } from "@/components/settings/iconLedRowClass";
import { SETTINGS_CARD_CLASS } from "@/components/settings/settingsCardClass";

export function AccountSection() {
  return (
    <Card className={SETTINGS_CARD_CLASS}>
      <CardHeader className="pb-3 px-4 pt-5">
        <CardTitle className="flex items-center gap-2 text-base font-medium tracking-tight">
          <HardDrive className="h-4 w-4 text-brand" strokeWidth={2.25} />
          本地单机独占模式
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground/80">
          应用运行于本地独立环境，所有数据保存在本地 SQLite
          数据库中，无需任何远程账号与登录。
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-2.5">
        <div className={cn(ICON_LED_ROW_CLASS, "justify-between")}>
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-foreground/70" />
            <div>
              <p className="text-sm font-medium">本地 SQLite 数据库</p>
              <p className="text-xs text-muted-foreground">
                better-sqlite3 WAL 模式
              </p>
            </div>
          </div>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            运行中
          </span>
        </div>
        <div className={cn(ICON_LED_ROW_CLASS, "justify-between")}>
          <div className="flex items-center gap-3">
            <Cpu className="h-5 w-5 text-foreground/70" />
            <div>
              <p className="text-sm font-medium">AI MCP 架构师通道</p>
              <p className="text-xs text-muted-foreground">
                kagelin-workspace-builder 本地 SQLite 直连
              </p>
            </div>
          </div>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
            已就绪
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
