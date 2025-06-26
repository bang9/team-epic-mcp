export type EpicStatusType =
  | "backlog"
  | "kickoff"
  | "planning"
  | "development"
  | "code_review"
  | "testing"
  | "ready_to_release"
  | "released"
  | "done"
  | "on_hold";

export type Platform = "iOS" | "Android" | "JS";

export type UpdateType =
  | "progress"
  | "blocker"
  | "resolved"
  | "comment"
  | "status_change";

export interface Epic {
  epic_id: string;
  epic_name: string;
  epic_url: string;
  current_status: EpicStatusType;
  ios_assignee: string;
  android_assignee: string;
  js_assignee: string;
  start_date: string;
  target_date: string;
  prd_link?: string;
  tip_link?: string;
}

export interface EpicStatus {
  epic_id: string;
  ios_progress: number;
  android_progress: number;
  js_progress: number;
  overall_status: string;
  last_comment: string;
  last_updated: string;
  updated_by: string;
}

export interface StatusUpdate {
  timestamp: string;
  epic_id: string;
  update_type: UpdateType;
  platform?: Platform;
  message: string;
  author: string;
}

export interface SheetData {
  epics: Epic[];
  epicStatuses: EpicStatus[];
  statusUpdates: StatusUpdate[];
}
