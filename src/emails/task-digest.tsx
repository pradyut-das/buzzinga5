import * as React from "react";

import type { NotificationType } from "@/db/schema";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  taskId: string;
  taskTitle: string;
  triggeredByName?: string;
  metadata?: {
    fromColumn?: string;
    toColumn?: string;
    priority?: string;
    commentPreview?: string;
    status?: string;
    docTitle?: string;
    docId?: string;
  };
  createdAt: Date;
};

export type TaskDigestEmailProps = {
  recipientName: string;
  boardTitle: string;
  boardUrl: string;
  unsubscribeUrl: string;
  notifications: NotificationItem[];
};

/** "in_production" reads as machine output; "in production" reads as English. */
function humanizeStatus(status: string): string {
  return status.replace(/_/g, " ");
}

function formatNotification(notification: NotificationItem): string {
  const { type, triggeredByName, metadata } = notification;
  const actor = triggeredByName || "Someone";

  switch (type) {
    case "created":
      return `${actor} created this task`;
    case "comment":
      return `${actor} commented${metadata?.commentPreview ? `: "${metadata.commentPreview}"` : ""}`;
    case "move":
      if (metadata?.fromColumn && metadata?.toColumn) {
        return `${actor} moved task from "${metadata.fromColumn}" to "${metadata.toColumn}"`;
      }
      return `${actor} moved the task`;
    case "assign":
      return `${actor} added you to this task`;
    case "priority":
      return `${actor} changed priority to ${metadata?.priority || "unknown"}`;
    case "mention":
      return `${actor} mentioned you${metadata?.commentPreview ? `: "${metadata.commentPreview}"` : ""}`;
    case "status":
      return `${actor} set the status to ${humanizeStatus(metadata?.status || "unknown")}`;
    case "doc":
      return `${actor} attached the document "${metadata?.docTitle || "Untitled"}"`;
    default:
      return `${actor} updated the task`;
  }
}

export function TaskDigestEmail({
  recipientName,
  boardTitle,
  boardUrl,
  unsubscribeUrl,
  notifications,
}: TaskDigestEmailProps) {
  // Group notifications by task
  const notificationsByTask = notifications.reduce(
    (acc, notification) => {
      const key = notification.taskId;
      if (!acc[key]) {
        acc[key] = {
          taskTitle: notification.taskTitle,
          taskId: notification.taskId,
          items: [],
        };
      }
      acc[key].items.push(notification);
      return acc;
    },
    {} as Record<string, { taskTitle: string; taskId: string; items: NotificationItem[] }>,
  );

  const taskGroups = Object.values(notificationsByTask);

  return (
    <div
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        maxWidth: "600px",
        margin: "0 auto",
        padding: "20px",
        backgroundColor: "#ffffff",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "600", color: "#111827", margin: "0 0 8px 0" }}>
          Task Updates
        </h1>
        <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
          Hi {recipientName}, here&apos;s what happened on{" "}
          <strong style={{ color: "#111827" }}>{boardTitle}</strong>
        </p>
      </div>

      {/* Task groups */}
      {taskGroups.map((group) => (
        <div
          key={group.taskId}
          style={{
            marginBottom: "20px",
            padding: "16px",
            backgroundColor: "#f9fafb",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
          }}
        >
          <a
            href={`${boardUrl}?task=${group.taskId}`}
            style={{
              fontSize: "16px",
              fontWeight: "600",
              color: "#2563eb",
              textDecoration: "none",
              display: "block",
              marginBottom: "12px",
            }}
          >
            {group.taskTitle}
          </a>
          <ul style={{ margin: 0, padding: "0 0 0 16px", listStyleType: "disc" }}>
            {group.items.map((notification) => (
              <li
                key={notification.id}
                style={{
                  fontSize: "14px",
                  color: "#374151",
                  marginBottom: "4px",
                }}
              >
                {formatNotification(notification)}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Footer */}
      <div
        style={{
          marginTop: "32px",
          paddingTop: "16px",
          borderTop: "1px solid #e5e7eb",
          fontSize: "12px",
          color: "#9ca3af",
        }}
      >
        <p style={{ margin: "0 0 8px 0" }}>
          You received this email because you are assigned to, working on, a stakeholder on, or were
          mentioned in these tasks.
        </p>
        <p style={{ margin: 0 }}>
          <a href={unsubscribeUrl} style={{ color: "#9ca3af", textDecoration: "underline" }}>
            Unsubscribe from these notifications
          </a>
        </p>
      </div>
    </div>
  );
}
