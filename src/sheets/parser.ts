import { Epic, EpicStatus, StatusUpdate } from "../types.js";

export function formatEpic(epic: Epic): string {
  return `📋 **${epic.epic_name}** (${epic.epic_id})
- 상태: ${epic.current_status}
- 기간: ${epic.start_date} ~ ${epic.target_date}
- 담당자:
  - iOS: ${epic.ios_assignee}
  - Android: ${epic.android_assignee}
  - JS: ${epic.js_assignee}
- [Epic Link](${epic.epic_url})${epic.prd_link ? ` | [PRD](${epic.prd_link})` : ""}${epic.tip_link ? ` | [TIP](${epic.tip_link})` : ""}`;
}

export function formatEpicWithStatus(epic: Epic, status?: EpicStatus): string {
  let result = formatEpic(epic);

  if (status) {
    result += `\n\n**현재 진행 상황:**
- iOS: ${status.ios_progress}%
- Android: ${status.android_progress}%
- JS: ${status.js_progress}%
- 전체 상태: ${status.overall_status}
- 최신 코멘트: ${status.last_comment}
- 업데이트: ${formatDate(status.last_updated)} by ${status.updated_by}`;
  }

  return result;
}

export function formatStatusUpdate(update: StatusUpdate): string {
  const typeEmoji = {
    progress: "📊",
    blocker: "🚫",
    resolved: "✅",
    comment: "💬",
    status_change: "🔄",
  };

  const emoji = typeEmoji[update.update_type] || "📝";
  const platform = update.platform ? `[${update.platform}] ` : "";

  return `${emoji} **${formatDate(update.timestamp)}** ${platform}- ${update.message} (by ${update.author})`;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function parseDate(dateString: string): Date {
  return new Date(dateString);
}

export function getDaysUntil(dateString: string): number {
  const targetDate = parseDate(dateString);
  const today = new Date();
  const diffTime = targetDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function calculateOverallProgress(status: EpicStatus): number {
  return Math.round(
    (status.ios_progress + status.android_progress + status.js_progress) / 3,
  );
}

export function getPlatformName(platform: "iOS" | "Android" | "JS"): string {
  const names = {
    iOS: "iOS",
    Android: "Android",
    JS: "JavaScript",
  };
  return names[platform] || platform;
}
