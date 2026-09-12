"use client";

import { cn } from "@/lib/utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import packageJson from "../../../package.json";
const { version } = packageJson;
import type { Project } from "@/lib/types/task";
import type { Workspace } from "@/lib/types/workspace";
import {
  SIDEBAR_COLLAPSE,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  CheckSquare,
  Calendar,
  BarChart3,
  Layers,
  Timer,
  Settings,
  Plus,
  Inbox,
  FolderKanban,
  ChevronDown,
  Trash2,
  ArchiveRestore,
  EllipsisVertical,
  Pencil,
  Sparkles,
} from "lucide-react";
import { WorkspaceIcon } from "@/components/icons/WorkspaceIcon";
import { DEFAULT_PROJECT_COLOR } from "@/lib/constants/colors";
import { useProjects } from "@/lib/hooks/useProjects";
import { useProjectActions } from "@/components/ProjectActionsProvider";
import { useWorkspaces } from "@/lib/hooks/useWorkspaces";
import { useWorkspaceActions } from "@/components/workspace/WorkspaceActionsProvider";
import { useUiStore } from "@/lib/store/uiStore";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { TranslationKey } from "@/lib/i18n/dictionaries/en";
import { ArchivedProjectsDialog } from "@/components/projects/ArchivedProjectsDialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const mainNavItems: {
  labelKey: TranslationKey;
  icon: typeof CheckSquare;
  path: string;
  id: string;
}[] = [
  {
    labelKey: "common.nav.allTasks",
    icon: CheckSquare,
    path: "/",
    id: "all-tasks",
  },
  {
    labelKey: "common.nav.habits",
    icon: Layers,
    path: "/habits",
    id: "habits",
  },
  {
    labelKey: "common.nav.calendar",
    icon: Calendar,
    path: "/calendar",
    id: "calendar",
  },
  {
    labelKey: "common.nav.stats",
    icon: BarChart3,
    path: "/stats",
    id: "stats",
  },
];

const secondaryNavItems: {
  labelKey: TranslationKey;
  icon: typeof CheckSquare;
  path: string;
  id: string;
}[] = [
  { labelKey: "common.nav.focus", icon: Timer, path: "/focus", id: "focus" },
  {
    labelKey: "common.nav.settings",
    icon: Settings,
    path: "/settings",
    id: "settings",
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMobile } = useSidebar();
  const { data: projects } = useProjects();
  const { openCreateProject, openEditProject, openDeleteProject } =
    useProjectActions();
  const { data: workspaces } = useWorkspaces();
  const { openCreateWorkspace, openRenameWorkspace, openDeleteWorkspace } =
    useWorkspaceActions();
  const isProjectsOpen = useUiStore((state) => state.isProjectsOpen);
  const toggleProjectsOpen = useUiStore((state) => state.toggleProjectsOpen);
  const isWorkspacesOpen = useUiStore((state) => state.isWorkspacesOpen);
  const toggleWorkspacesOpen = useUiStore(
    (state) => state.toggleWorkspacesOpen,
  );
  const hasChangelogUpdate = useUiStore((state) => state.hasChangelogUpdate);
  const setChangelogOpen = useUiStore((state) => state.setChangelogOpen);
  const { trigger } = useHaptic();
  const { t } = useTranslation();

  const [mobileActionProject, setMobileActionProject] =
    useState<Project | null>(null);
  const [mobileActionWorkspace, setMobileActionWorkspace] =
    useState<Workspace | null>(null);
  const [isArchivedOpen, setIsArchivedOpen] = useState(false);

  const currentProjectId = searchParams.get("project");

  // Prefetch all routes on mount for instant navigation
  useEffect(() => {
    const allRoutes = [...mainNavItems, ...secondaryNavItems].map(
      (item) => item.path,
    );
    allRoutes.forEach((path) => router.prefetch(path));
  }, [router]);

  const handleMobileRouteIntent = () => {
    trigger("toggle");
    // Let the route change close the mobile sidebar via SidebarProvider.
    // Closing it on a timer can race the sheet's history cleanup and cancel navigation.
  };

  return (
    <>
      <Sidebar variant="sidebar" collapsible="icon" className="h-screen">
        <SidebarHeader>
          <div className="flex items-center py-2 h-14 pl-0.5">
            {/* Logo — always in-flow, left-aligned matching nav icons */}
            <Image
              src="/kagelin-icon.png"
              alt="Kagelin"
              width={32}
              height={32}
              priority
              className="h-8 w-8 rounded-lg shrink-0"
            />
            {/* Label + trigger hidden when collapsed (matching nav item pattern) */}
            <div
              className={cn(
                "flex items-center justify-between ml-2 flex-1",
                SIDEBAR_COLLAPSE.hideContent,
              )}
            >
              <span className="type-h2 whitespace-nowrap">Kagelin</span>
              <SidebarTrigger className="h-9 w-9 shrink-0 active:scale-95 transition-all [&_svg]:stroke-[2.25px]" />
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainNavItems
                  .filter((item) => {
                    if (isMobile) {
                      return item.id !== "stats" && item.id !== "calendar";
                    }
                    return true;
                  })
                  .map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      item.id === "all-tasks"
                        ? pathname === item.path &&
                          (!currentProjectId || currentProjectId === "all")
                        : pathname === item.path;
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={t(item.labelKey)}
                        >
                          <Link
                            href={
                              item.id === "all-tasks"
                                ? "/?project=all"
                                : item.path
                            }
                            onClick={() => {
                              handleMobileRouteIntent();
                            }}
                          >
                            <div className="flex items-center justify-center w-5 h-5 shrink-0">
                              <Icon className="h-4 w-4" strokeWidth={2.25} />
                            </div>
                            <span>{t(item.labelKey)}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          {/* Projects Section */}
          <SidebarGroup>
            <SidebarGroupLabel
              className="cursor-pointer text-sidebar-foreground [&_svg]:opacity-100"
              onClick={() => {
                trigger("toggle");
                toggleProjectsOpen();
              }}
            >
              <FolderKanban strokeWidth={2.25} />
              <span className="flex-1">{t("common.sidebar.projects")}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${
                  isProjectsOpen ? "" : "-rotate-90"
                }`}
              />
              <button
                type="button"
                title={t("common.sidebar.addProject")}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-sidebar-foreground outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
                onClick={(e) => {
                  e.stopPropagation();
                  trigger("toggle");
                  openCreateProject();
                }}
              >
                <Plus className="h-5 w-5 md:h-4 md:w-4" />
              </button>
            </SidebarGroupLabel>
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-seijaku",
                isProjectsOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <SidebarGroupContent>
                  <SidebarMenu className="pl-2 group-data-[collapsible=icon]:pl-0">
                    {/* Inbox */}
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        isActive={currentProjectId === "inbox"}
                        tooltip={t("common.sidebar.inbox")}
                      >
                        <Link
                          href="/?project=inbox"
                          onClick={() => {
                            handleMobileRouteIntent();
                          }}
                        >
                          <div className="flex items-center justify-center w-5 h-5 shrink-0">
                            <Inbox className="h-4 w-4" strokeWidth={2.25} />
                          </div>
                          <span>{t("common.sidebar.inbox")}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    {/* User Projects */}
                    {projects
                      ?.filter((p) => !p.is_inbox)
                      .map((project) => (
                        <SidebarMenuItem key={project.id} className="relative">
                          <SidebarMenuButton
                            asChild
                            isActive={currentProjectId === project.id}
                            tooltip={project.name}
                            className="peer"
                          >
                            <Link
                              href={`/?project=${project.id}`}
                              onClick={() => {
                                handleMobileRouteIntent();
                              }}
                            >
                              <div className="flex items-center justify-center w-5 h-5 shrink-0">
                                <div
                                  className="h-3 w-3 rounded-full"
                                  style={{ backgroundColor: project.color }}
                                />
                              </div>
                              <span className="truncate">{project.name}</span>
                            </Link>
                          </SidebarMenuButton>

                          {/* Project Actions */}
                          {/* Project Actions */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <SidebarMenuAction
                                showOnHover={!isMobile}
                                className="peer-data-[active=true]/menu-button:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
                                onClick={(e) => {
                                  if (isMobile) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    trigger("toggle");
                                    setMobileActionProject(project);
                                  }
                                }}
                              >
                                <EllipsisVertical
                                  className="h-4 w-4"
                                  strokeWidth={2.25}
                                />
                                <span className="sr-only">
                                  {t("common.sidebar.more")}
                                </span>
                              </SidebarMenuAction>
                            </DropdownMenuTrigger>
                            {!isMobile && (
                              <DropdownMenuContent
                                side="right"
                                align="start"
                                className="w-48"
                              >
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    trigger("toggle");
                                    openEditProject(project);
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <Pencil
                                    className="h-4 w-4"
                                    strokeWidth={2.25}
                                  />
                                  <span>{t("common.sidebar.editProject")}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    trigger("thud");
                                    openDeleteProject(project);
                                  }}
                                  className="flex items-center gap-2"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span>
                                    {t("common.sidebar.deleteProject")}
                                  </span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            )}
                          </DropdownMenu>
                        </SidebarMenuItem>
                      ))}

                    {/* Archived Projects */}
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => {
                          trigger("toggle");
                          setIsArchivedOpen(true);
                        }}
                        tooltip={t("common.sidebar.archivedProjects")}
                      >
                        <div className="flex items-center justify-center w-5 h-5 shrink-0">
                          <ArchiveRestore
                            className="h-4 w-4"
                            strokeWidth={2.25}
                          />
                        </div>
                        <span className="truncate">
                          {t("common.sidebar.archivedProjects")}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </div>
            </div>
          </SidebarGroup>

          {/* Workspaces Section — the canvas feature's sidebar entry */}
          <SidebarGroup>
            <SidebarGroupLabel
              className="cursor-pointer text-sidebar-foreground [&_svg]:opacity-100"
              onClick={() => {
                trigger("toggle");
                toggleWorkspacesOpen();
              }}
            >
              <WorkspaceIcon strokeWidth={2.25} />
              <span className="flex-1">{t("common.nav.workspaces")}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${
                  isWorkspacesOpen ? "" : "-rotate-90"
                }`}
              />
              <button
                type="button"
                title={t("common.sidebar.addWorkspace")}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-sidebar-foreground outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
                onClick={(e) => {
                  e.stopPropagation();
                  trigger("toggle");
                  openCreateWorkspace();
                }}
              >
                <Plus className="h-5 w-5 md:h-4 md:w-4" />
              </button>
            </SidebarGroupLabel>
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-seijaku",
                isWorkspacesOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden">
                <SidebarGroupContent>
                  <SidebarMenu className="pl-2 group-data-[collapsible=icon]:pl-0">
                    {workspaces?.map((workspace) => (
                      <SidebarMenuItem key={workspace.id} className="relative">
                        <SidebarMenuButton
                          asChild
                          isActive={pathname === `/workspaces/${workspace.id}`}
                          tooltip={workspace.name}
                          className="peer"
                        >
                          <Link
                            href={`/workspaces/${workspace.id}`}
                            onClick={() => {
                              handleMobileRouteIntent();
                            }}
                          >
                            <div className="flex items-center justify-center w-5 h-5 shrink-0">
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{
                                  backgroundColor:
                                    workspace.color || DEFAULT_PROJECT_COLOR,
                                }}
                              />
                            </div>
                            <span className="truncate">{workspace.name}</span>
                          </Link>
                        </SidebarMenuButton>

                        {/* Workspace Actions */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuAction
                              showOnHover={!isMobile}
                              className="peer-data-[active=true]/menu-button:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
                              onClick={(e) => {
                                if (isMobile) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  trigger("toggle");
                                  setMobileActionWorkspace(workspace);
                                }
                              }}
                            >
                              <EllipsisVertical
                                className="h-4 w-4"
                                strokeWidth={2.25}
                              />
                              <span className="sr-only">
                                {t("common.sidebar.more")}
                              </span>
                            </SidebarMenuAction>
                          </DropdownMenuTrigger>
                          {!isMobile && (
                            <DropdownMenuContent
                              side="right"
                              align="start"
                              className="w-48"
                            >
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  trigger("toggle");
                                  openRenameWorkspace(workspace);
                                }}
                                className="flex items-center gap-2"
                              >
                                <Pencil
                                  className="h-4 w-4"
                                  strokeWidth={2.25}
                                />
                                <span>
                                  {t("common.sidebar.renameWorkspace")}
                                </span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  trigger("thud");
                                  openDeleteWorkspace(workspace);
                                }}
                                className="flex items-center gap-2"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>
                                  {t("common.sidebar.deleteWorkspace")}
                                </span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          )}
                        </DropdownMenu>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </div>
            </div>
          </SidebarGroup>

          {!isMobile && (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {secondaryNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.path;
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={t(item.labelKey)}
                        >
                          <Link
                            href={item.path}
                            onClick={() => {
                              trigger("toggle");
                            }}
                          >
                            <div className="flex items-center justify-center w-5 h-5 shrink-0">
                              <Icon className="h-4 w-4" strokeWidth={2.25} />
                            </div>
                            <span>{t(item.labelKey)}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter className="border-t border-border overflow-hidden md:p-2 p-0">
          {isMobile && (
            <SidebarMenu className="p-2 pb-2">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/focus"}
                  tooltip={t("common.nav.focus")}
                >
                  <Link
                    href="/focus"
                    onClick={() => {
                      handleMobileRouteIntent();
                    }}
                  >
                    <div className="flex items-center justify-center w-5 h-5 shrink-0">
                      <Timer className="h-4 w-4" strokeWidth={2.25} />
                    </div>
                    <span>{t("common.nav.focus")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/settings"}
                  tooltip={t("common.nav.settings")}
                >
                  <Link
                    href="/settings"
                    onClick={() => {
                      handleMobileRouteIntent();
                    }}
                  >
                    <div className="flex items-center justify-center w-5 h-5 shrink-0">
                      <Settings className="h-4 w-4" strokeWidth={2.25} />
                    </div>
                    <span>{t("common.nav.settings")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          )}

          {!isMobile && hasChangelogUpdate && (
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setChangelogOpen(true)}
                  tooltip={t("common.sidebar.whatsNew")}
                  className="text-foreground/70"
                >
                  <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
                    <Sparkles className="h-4 w-4" strokeWidth={2.25} />
                    <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
                  </div>
                  <span>{t("common.sidebar.whatsNew")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          )}

          <div
            className={cn(
              "relative flex flex-col justify-center",
              isMobile ? "px-4 py-4 pt-2" : "h-[48px] px-4 py-3",
            )}
          >
            {!isMobile && (
              <div className="absolute inset-x-0 flex justify-center w-full transition-opacity duration-200 ease-seijaku group-data-[state=expanded]:opacity-0 group-data-[state=expanded]:pointer-events-none">
                <SidebarTrigger className="h-9 w-9 active:scale-95 transition-all" />
              </div>
            )}

            <div
              className={cn(
                "w-full transition-opacity duration-200 ease-seijaku",
                !isMobile &&
                  "group-data-[state=collapsed]:opacity-0 group-data-[state=collapsed]:pointer-events-none flex flex-col gap-1.5",
              )}
            >
              {isMobile ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest leading-none">
                      {t("common.sidebar.build")}
                    </span>
                    {version.includes("preview") && (
                      <span className="px-1.5 py-0.5 rounded-md bg-brand/10 text-brand text-[9px] font-bold uppercase tracking-widest border border-brand/20 leading-none">
                        {t("common.sidebar.preview")}
                      </span>
                    )}
                  </div>
                  <span className="text-[13px] font-medium text-muted-foreground tracking-tight leading-none">
                    v{version}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest leading-none">
                      {t("common.sidebar.build")}
                    </span>
                    {version.includes("preview") && (
                      <span className="px-1.5 py-0.5 rounded-md bg-brand/10 text-brand text-[9px] font-bold uppercase tracking-widest border border-brand/20 leading-none">
                        {t("common.sidebar.preview")}
                      </span>
                    )}
                  </div>
                  <span className="text-[13px] font-medium text-muted-foreground tracking-tight leading-none">
                    v{version}
                  </span>
                </>
              )}
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <ArchivedProjectsDialog
        open={isArchivedOpen}
        onOpenChange={setIsArchivedOpen}
      />

      {/* Mobile Project Action Drawer */}
      <Drawer
        open={!!mobileActionProject}
        onOpenChange={(open) => !open && setMobileActionProject(null)}
      >
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{mobileActionProject?.name}</DrawerTitle>
            <DrawerDescription>
              {t("common.sidebar.actionPrompt")}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="pt-2">
            <DrawerClose asChild>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  trigger("toggle");
                  setMobileActionProject(null);
                  if (mobileActionProject) openEditProject(mobileActionProject);
                }}
              >
                {t("common.sidebar.editProject")}
              </Button>
            </DrawerClose>
            <DrawerClose asChild>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => {
                  trigger("thud");
                  setMobileActionProject(null);
                  if (mobileActionProject)
                    openDeleteProject(mobileActionProject);
                }}
              >
                {t("common.sidebar.deleteProject")}
              </Button>
            </DrawerClose>
            <DrawerClose asChild>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => trigger("tick")}
              >
                {t("common.cancel")}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Mobile Workspace Action Drawer */}
      <Drawer
        open={!!mobileActionWorkspace}
        onOpenChange={(open) => !open && setMobileActionWorkspace(null)}
      >
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{mobileActionWorkspace?.name}</DrawerTitle>
            <DrawerDescription>
              {t("common.sidebar.actionPrompt")}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="pt-2">
            <DrawerClose asChild>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  trigger("toggle");
                  setMobileActionWorkspace(null);
                  if (mobileActionWorkspace)
                    openRenameWorkspace(mobileActionWorkspace);
                }}
              >
                {t("common.sidebar.renameWorkspace")}
              </Button>
            </DrawerClose>
            <DrawerClose asChild>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => {
                  trigger("thud");
                  setMobileActionWorkspace(null);
                  if (mobileActionWorkspace)
                    openDeleteWorkspace(mobileActionWorkspace);
                }}
              >
                {t("common.sidebar.deleteWorkspace")}
              </Button>
            </DrawerClose>
            <DrawerClose asChild>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => trigger("tick")}
              >
                {t("common.cancel")}
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
