export type WorkspaceTheme = "dark" | "light" | "system";
export type WorkspaceDensity = "compact" | "balanced" | "airy";
export type AsyncState = "idle" | "loading" | "success" | "empty" | "error";

export interface WorkspaceRoute {
  section: string;
  subpage?: string;
}

export interface WorkspaceUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  permissions?: string[];
}

export interface CommandAction {
  id: string;
  label: string;
  description: string;
  keywords?: string[];
  shortcut?: string;
  run: () => void | Promise<void>;
}

export interface DataFilter {
  id: string;
  label: string;
  value: string;
  count?: number;
}
