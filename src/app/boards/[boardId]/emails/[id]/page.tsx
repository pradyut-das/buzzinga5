"use client";

import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, Clock, CheckCircle, User, Type } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type SentEmail = {
  id: string;
  fromEmail: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  boardId: string;
  boardTitle: string;
  htmlContent: string;
  notificationIds: string;
  sentToResend: boolean;
  createdAt: string;
};

interface PageProps {
  params: Promise<{ boardId: string; id: string }>;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

export default function BoardEmailViewerPage({ params }: PageProps) {
  const { boardId, id } = use(params);
  const [email, setEmail] = useState<SentEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const fetchEmail = async () => {
      try {
        const response = await fetch(`/api/boards/${boardId}/emails/${id}`);
        if (response.status === 401) {
          setUnauthorized(true);
          setLoading(false);
          return;
        }
        if (response.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const data = await response.json();
        setEmail(data.email);
      } catch (error) {
        console.error("Failed to fetch email:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchEmail();
  }, [boardId, id]);

  if (loading) {
    return (
      <div className="min-h-screen gradient-holographic p-8">
        <div className="mx-auto max-w-5xl">
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

  if (notFound || !email) {
    return (
      <div className="min-h-screen gradient-holographic p-8">
        <div className="mx-auto max-w-4xl">
          <div className="glass glass-strong border border-border/50 p-8 text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">Email Not Found</h1>
            <Button variant="outline" asChild>
              <Link href={`/boards/${boardId}/emails`}>Back to Email History</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const notificationIds = JSON.parse(email.notificationIds) as string[];

  return (
    <div className="min-h-screen gradient-holographic p-8">
      <div className="mx-auto max-w-5xl">
        <div className="glass glass-strong border border-border/50 p-8">
          {/* Header */}
          <div className="mb-6 flex items-center gap-4">
            <Button variant="outline" size="icon" asChild>
              <Link href={`/boards/${boardId}/emails`}>
                <ArrowLeft />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Mail className="h-6 w-6" />
                Email Details
              </h1>
            </div>
          </div>

          {/* Email metadata */}
          <div className="mb-6 rounded-lg border border-border/50 bg-muted/30 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">From:</span>
                <span className="text-sm font-medium">Kanban Board &lt;{email.fromEmail}&gt;</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">To:</span>
                <span className="text-sm font-medium">
                  {email.recipientName} &lt;{email.recipientEmail}&gt;
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Type className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Subject:</span>
                <span className="text-sm font-medium">{email.subject}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Sent:</span>
                <span className="text-sm font-medium">{formatDate(email.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                {email.sentToResend ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-green-600 dark:text-green-400">
                      Sent via Resend
                    </span>
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                      Local only (not sent)
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Board:</span>
              <Link
                href={`/boards/${email.boardId}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {email.boardTitle}
              </Link>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Contains {notificationIds.length} notification(s)
            </div>
          </div>

          {/* Email content in iframe */}
          <div className="rounded-lg border border-border/50 bg-white overflow-hidden">
            <iframe
              srcDoc={email.htmlContent}
              title="Email Preview"
              className="w-full min-h-[500px] border-0"
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
