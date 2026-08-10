"use client";

import { useState, useEffect, useCallback, use } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Mail, ExternalLink, CheckCircle, Clock, ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import Link from "next/link";
import { useRouter } from "next/navigation";

type SentEmail = {
  id: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  boardId: string;
  boardTitle: string;
  sentToResend: boolean;
  createdAt: string;
};

interface PageProps {
  params: Promise<{ boardId: string }>;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

export default function BoardEmailsPage({ params }: PageProps) {
  const { boardId } = use(params);
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const router = useRouter();

  const fetchEmails = useCallback(async () => {
    try {
      const response = await fetch(`/api/boards/${boardId}/emails`);
      if (response.status === 401) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }
      const data = await response.json();
      setEmails(data.emails || []);
    } catch (error) {
      console.error("Failed to fetch emails:", error);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const handleProcessNotifications = async () => {
    setProcessing(true);
    try {
      const response = await fetch(`/api/boards/${boardId}/emails`, {
        method: "POST",
      });
      const data = await response.json();
      console.log("Processed notifications:", data);
      await fetchEmails();
    } catch (error) {
      console.error("Failed to process notifications:", error);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="app-canvas min-h-screen p-8">
        <div className="mx-auto max-w-4xl">
          <div className="glass glass-strong border border-border/50 p-8 text-center">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (unauthorized) {
    router.push(`/boards/${boardId}/unlock`);
    return null;
  }

  return (
    <div className="app-canvas min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        <div className="glass glass-strong border border-border/50 p-8">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" asChild>
                <Link href={`/boards/${boardId}`}>
                  <ArrowLeft />
                </Link>
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                  <Mail className="h-8 w-8" />
                  Email History
                </h1>
                <p className="mt-2 text-muted-foreground">
                  View notification emails sent for this board
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Button
                onClick={handleProcessNotifications}
                disabled={processing}
                variant="ghost"
                size="sm"
              >
                <RefreshCw className={processing ? "animate-spin" : ""} />
                {processing ? "Processing..." : "Process Now"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Emails are sent automatically every 30 minutes
              </span>
            </div>
          </div>

          {/* Email list */}
          {emails.length === 0 ? (
            <div className="rounded-lg border border-border/50 bg-muted/30">
              <EmptyState
                icon={Mail}
                iconSize="sm"
                title="No emails sent yet"
                description="Notification emails will appear here when contributors with email addresses receive updates"
              />
            </div>
          ) : (
            <div className="space-y-3">
              {emails.map((email) => (
                <Link
                  key={email.id}
                  href={`/boards/${boardId}/emails/${email.id}`}
                  className="block rounded-lg border border-border/50 bg-white/40 dark:bg-white/5 p-4 transition-colors hover:bg-white/60 dark:hover:bg-white/10"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">
                          {email.recipientName}
                        </span>
                        <span className="text-muted-foreground text-sm truncate">
                          &lt;{email.recipientEmail}&gt;
                        </span>
                      </div>
                      <p className="mt-1 font-medium text-foreground">{email.subject}</p>
                      <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{formatDate(email.createdAt)}</span>
                        {email.sentToResend ? (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <CheckCircle className="h-3 w-3" />
                            Sent via Resend
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <Clock className="h-3 w-3" />
                            Local only
                          </span>
                        )}
                      </div>
                    </div>
                    <ExternalLink className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-4" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
